// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Sepolia mUSDC / native ETH escrow for AgentMesh missions. The platform never
///         receives a user's private key and never custodies funds off-chain.
contract AgentMeshEscrow is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    uint16 public constant MAX_FEE_BPS = 1_000;

    enum EscrowStatus {
        None,
        Held,
        Frozen,
        Released,
        Refunded
    }

    enum AssetKind {
        Token,
        Native
    }

    struct Escrow {
        address requester;
        uint128 amount;
        EscrowStatus status;
        AssetKind assetKind;
        bytes32 payoutHash;
    }

    IERC20 public immutable token;
    address public immutable treasury;
    uint16 public immutable platformFeeBps;
    mapping(bytes32 missionKey => Escrow escrow) public escrows;

    event EscrowDeposited(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount, bytes32 payoutHash);
    event EscrowFrozen(bytes32 indexed missionKey, address indexed actor);
    event EscrowUnfrozen(bytes32 indexed missionKey, address indexed arbiter);
    event EscrowReleased(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount, uint256 platformFee, bytes32 payoutHash);
    event EscrowRefunded(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidFee();
    error InvalidStatus(EscrowStatus expected, EscrowStatus actual);
    error NotRequester();
    error NotFreezeAuthority();
    error InvalidRecipients();
    error InvalidPayoutHash();
    error NativeTransferFailed();

    constructor(address tokenAddress, address treasuryAddress, address admin, uint16 feeBps) {
        if (tokenAddress == address(0) || treasuryAddress == address(0) || admin == address(0)) revert InvalidAddress();
        if (feeBps > MAX_FEE_BPS) revert InvalidFee();
        token = IERC20(tokenAddress);
        treasury = treasuryAddress;
        platformFeeBps = feeBps;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
    }

    /// @notice mUSDC deposit entry point with an immutable payout commitment.
    function deposit(bytes32 missionKey, uint128 amount, bytes32 payoutHash) external whenNotPaused nonReentrant {
        _depositToken(missionKey, amount, payoutHash);
    }

    function depositToken(bytes32 missionKey, uint128 amount, bytes32 payoutHash) external whenNotPaused nonReentrant {
        _depositToken(missionKey, amount, payoutHash);
    }

    function depositNative(bytes32 missionKey, bytes32 payoutHash) external payable whenNotPaused nonReentrant {
        if (msg.value == 0 || msg.value > type(uint128).max) revert InvalidAmount();
        Escrow storage escrow = _createEscrow(missionKey, uint128(msg.value), AssetKind.Native, payoutHash);
        emit EscrowDeposited(missionKey, escrow.requester, address(0), msg.value, payoutHash);
    }

    function _depositToken(bytes32 missionKey, uint128 amount, bytes32 payoutHash) private {
        if (amount == 0) revert InvalidAmount();
        Escrow storage escrow = _createEscrow(missionKey, amount, AssetKind.Token, payoutHash);
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowDeposited(missionKey, escrow.requester, address(token), amount, payoutHash);
    }

    function _createEscrow(bytes32 missionKey, uint128 amount, AssetKind assetKind, bytes32 payoutHash)
        private
        returns (Escrow storage escrow)
    {
        if (payoutHash == bytes32(0)) revert InvalidPayoutHash();
        escrow = escrows[missionKey];
        if (escrow.status != EscrowStatus.None) revert InvalidStatus(EscrowStatus.None, escrow.status);
        escrow.requester = msg.sender;
        escrow.amount = amount;
        escrow.status = EscrowStatus.Held;
        escrow.assetKind = assetKind;
        escrow.payoutHash = payoutHash;
    }

    /// @dev Weights are relative stage budgets. Duplicate recipients are valid;
    ///      the frontend normally aggregates them to reduce gas.
    function release(bytes32 missionKey, address[] calldata recipients, uint256[] calldata weights)
        external
        whenNotPaused
        nonReentrant
    {
        Escrow storage escrow = escrows[missionKey];
        if (escrow.status != EscrowStatus.Held) revert InvalidStatus(EscrowStatus.Held, escrow.status);
        if (msg.sender != escrow.requester) revert NotRequester();
        if (recipients.length == 0 || recipients.length != weights.length) revert InvalidRecipients();

        uint256 weightTotal;
        for (uint256 i; i < weights.length; ++i) {
            if (recipients[i] == address(0) || weights[i] == 0) revert InvalidRecipients();
            weightTotal += weights[i];
        }
        bytes32 payoutHash = keccak256(abi.encode(recipients, weights));
        if (payoutHash != escrow.payoutHash) revert InvalidPayoutHash();

        uint256 total = escrow.amount;
        uint256 fee = total * platformFeeBps / 10_000;
        uint256 distributable = total - fee;
        uint256 paid;
        escrow.status = EscrowStatus.Released;
        address asset = escrow.assetKind == AssetKind.Native ? address(0) : address(token);

        for (uint256 i; i < recipients.length; ++i) {
            uint256 payout = i + 1 == recipients.length
                ? distributable - paid
                : distributable * weights[i] / weightTotal;
            paid += payout;
            _transferAsset(escrow.assetKind, recipients[i], payout);
        }
        if (fee > 0) _transferAsset(escrow.assetKind, treasury, fee);
        emit EscrowReleased(missionKey, escrow.requester, asset, total, fee, payoutHash);
    }

    /// @notice The requester can freeze their own funds immediately when opening a dispute.
    ///         Arbiters retain the same ability for emergency intervention.
    function freeze(bytes32 missionKey) external {
        Escrow storage escrow = escrows[missionKey];
        if (escrow.status != EscrowStatus.Held) revert InvalidStatus(EscrowStatus.Held, escrow.status);
        if (msg.sender != escrow.requester && !hasRole(ARBITER_ROLE, msg.sender)) revert NotFreezeAuthority();
        escrow.status = EscrowStatus.Frozen;
        emit EscrowFrozen(missionKey, msg.sender);
    }

    function unfreeze(bytes32 missionKey) external onlyRole(ARBITER_ROLE) {
        Escrow storage escrow = escrows[missionKey];
        if (escrow.status != EscrowStatus.Frozen) revert InvalidStatus(EscrowStatus.Frozen, escrow.status);
        escrow.status = EscrowStatus.Held;
        emit EscrowUnfrozen(missionKey, msg.sender);
    }

    function refund(bytes32 missionKey) external onlyRole(ARBITER_ROLE) nonReentrant {
        Escrow storage escrow = escrows[missionKey];
        if (escrow.status != EscrowStatus.Held && escrow.status != EscrowStatus.Frozen) {
            revert InvalidStatus(EscrowStatus.Held, escrow.status);
        }
        escrow.status = EscrowStatus.Refunded;
        address asset = escrow.assetKind == AssetKind.Native ? address(0) : address(token);
        _transferAsset(escrow.assetKind, escrow.requester, escrow.amount);
        emit EscrowRefunded(missionKey, escrow.requester, asset, escrow.amount);
    }

    function _transferAsset(AssetKind assetKind, address recipient, uint256 amount) private {
        if (assetKind == AssetKind.Token) {
            token.safeTransfer(recipient, amount);
            return;
        }
        (bool success,) = payable(recipient).call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}

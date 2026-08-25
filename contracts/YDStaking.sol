// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Votes} from "@openzeppelin/contracts/governance/utils/Votes.sol";

/// @notice Non-transferable, verified-account YD locks with delegated Power checkpoints.
contract YDStaking is AccessControl, Pausable, ReentrancyGuard, Votes {
    using SafeERC20 for IERC20Metadata;

    bytes32 public constant ACCOUNT_VERIFIER_ROLE = keccak256("ACCOUNT_VERIFIER_ROLE");
    bytes32 public constant REPUTATION_MANAGER_ROLE = keccak256("REPUTATION_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint64 public constant MIN_LOCK_DURATION = 30 days;
    uint64 public constant MAX_LOCK_DURATION = 730 days;
    uint16 public constant MIN_REPUTATION_BPS = 5_000;
    uint16 public constant MAX_REPUTATION_BPS = 15_000;
    uint16 public constant DEFAULT_REPUTATION_BPS = 10_000;
    uint256 public constant POWER_SCALE = 1e9;
    bytes32 private constant VERIFIED_DELEGATION_TYPEHASH =
        keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

    struct Position {
        uint128 amount;
        uint64 unlockTime;
        uint64 duration;
    }

    IERC20Metadata public immutable ydToken;
    uint8 public immutable ydDecimals;
    uint256 public immutable maxLockedPerAccount;
    uint256 public immutable maxPowerPerAccount;

    mapping(address account => Position position) public positions;
    mapping(address account => bool verified) public verifiedAccounts;
    mapping(address account => uint16 reputationBps) private _reputationBps;
    mapping(address account => uint256 power) private _rawPower;

    event AccountVerificationChanged(address indexed account, bool verified);
    event ReputationChanged(address indexed account, uint16 previousBps, uint16 newBps);
    event PositionChanged(address indexed account, uint256 amount, uint64 unlockTime, uint64 duration, uint256 rawPower);
    event PositionWithdrawn(address indexed account, uint256 amount, bool emergency);

    error InvalidAddress();
    error InvalidConfiguration();
    error AccountNotVerified();
    error InvalidAmount();
    error InvalidDuration();
    error PositionAlreadyExists();
    error PositionMissing();
    error PositionLocked(uint64 unlockTime);
    error PositionExpired();
    error LockLimitExceeded();
    error PowerLimitExceeded();
    error InvalidReputation();

    constructor(
        address tokenAddress,
        address admin,
        uint256 accountLockCap,
        uint256 accountPowerCap
    ) EIP712("AgentMesh veYD", "1") {
        if (tokenAddress == address(0) || admin == address(0)) revert InvalidAddress();
        if (
            accountLockCap == 0
                || accountPowerCap == 0
                || accountLockCap > type(uint128).max
                || accountPowerCap > type(uint208).max
        ) revert InvalidConfiguration();
        uint8 decimals = IERC20Metadata(tokenAddress).decimals();
        if (decimals > 18) revert InvalidConfiguration();

        ydToken = IERC20Metadata(tokenAddress);
        ydDecimals = decimals;
        maxLockedPerAccount = accountLockCap;
        maxPowerPerAccount = accountPowerCap;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ACCOUNT_VERIFIER_ROLE, admin);
        _grantRole(REPUTATION_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function reputationBps(address account) public view returns (uint16) {
        uint16 configured = _reputationBps[account];
        return configured == 0 ? DEFAULT_REPUTATION_BPS : configured;
    }

    function rawPowerOf(address account) public view returns (uint256) {
        return _rawPower[account];
    }

    function setVerifiedAccount(address account, bool verified) external onlyRole(ACCOUNT_VERIFIER_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        verifiedAccounts[account] = verified;
        _refreshPower(account);
        emit AccountVerificationChanged(account, verified);
    }

    function setReputation(address account, uint16 newBps) external onlyRole(REPUTATION_MANAGER_ROLE) {
        if (newBps < MIN_REPUTATION_BPS || newBps > MAX_REPUTATION_BPS) revert InvalidReputation();
        uint16 previous = reputationBps(account);
        _reputationBps[account] = newBps;
        _refreshPower(account);
        emit ReputationChanged(account, previous, newBps);
    }

    function lock(uint128 amount, uint64 duration) external nonReentrant whenNotPaused {
        if (!verifiedAccounts[msg.sender]) revert AccountNotVerified();
        if (positions[msg.sender].amount != 0) revert PositionAlreadyExists();
        _validateAmountAndDuration(amount, duration);

        if (delegates(msg.sender) == address(0)) _delegate(msg.sender, msg.sender);
        positions[msg.sender] = Position({
            amount: amount,
            unlockTime: uint64(block.timestamp) + duration,
            duration: duration
        });
        ydToken.safeTransferFrom(msg.sender, address(this), amount);
        _refreshPower(msg.sender);
        _emitPosition(msg.sender);
    }

    function increaseLock(uint128 amount) external nonReentrant whenNotPaused {
        if (!verifiedAccounts[msg.sender]) revert AccountNotVerified();
        Position storage position = positions[msg.sender];
        if (position.amount == 0) revert PositionMissing();
        if (block.timestamp >= position.unlockTime) revert PositionExpired();
        if (amount == 0 || uint256(position.amount) + amount > maxLockedPerAccount) revert LockLimitExceeded();
        position.amount += amount;
        ydToken.safeTransferFrom(msg.sender, address(this), amount);
        _refreshPower(msg.sender);
        _emitPosition(msg.sender);
    }

    function extendLock(uint64 duration) external whenNotPaused {
        Position storage position = positions[msg.sender];
        if (position.amount == 0) revert PositionMissing();
        if (duration < MIN_LOCK_DURATION || duration > MAX_LOCK_DURATION) revert InvalidDuration();
        uint64 nextUnlock = uint64(block.timestamp) + duration;
        if (nextUnlock <= position.unlockTime) revert InvalidDuration();
        position.unlockTime = nextUnlock;
        position.duration = duration;
        _refreshPower(msg.sender);
        _emitPosition(msg.sender);
    }

    function withdraw() external nonReentrant {
        Position memory position = positions[msg.sender];
        if (position.amount == 0) revert PositionMissing();
        if (block.timestamp < position.unlockTime) revert PositionLocked(position.unlockTime);
        _withdraw(msg.sender, position.amount, false);
    }

    /// @notice Permissionless checkpoint that removes Power from an expired lock.
    /// @dev Power checkpoints cannot decay without a transaction, so keepers may call this
    ///      before governance snapshots even when the position owner has not withdrawn.
    function syncExpiredPower(address account) external {
        Position memory position = positions[account];
        if (position.amount == 0) revert PositionMissing();
        if (block.timestamp < position.unlockTime) revert PositionLocked(position.unlockTime);
        _refreshPower(account);
        _emitPosition(account);
    }

    function emergencyWithdraw() external nonReentrant whenPaused {
        Position memory position = positions[msg.sender];
        if (position.amount == 0) revert PositionMissing();
        _withdraw(msg.sender, position.amount, true);
    }

    function delegate(address delegatee) public override {
        if (!verifiedAccounts[msg.sender] || !verifiedAccounts[delegatee]) revert AccountNotVerified();
        super.delegate(delegatee);
    }

    function delegateBySig(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override {
        if (block.timestamp > expiry) revert VotesExpiredSignature(expiry);
        address signer = ECDSA.recover(
            _hashTypedDataV4(keccak256(abi.encode(VERIFIED_DELEGATION_TYPEHASH, delegatee, nonce, expiry))),
            v,
            r,
            s
        );
        if (!verifiedAccounts[signer] || !verifiedAccounts[delegatee]) revert AccountNotVerified();
        _useCheckedNonce(signer, nonce);
        _delegate(signer, delegatee);
    }

    function powerFor(uint256 amount, uint64 duration, uint16 accountReputationBps) public view returns (uint256) {
        if (amount == 0) return 0;
        if (duration < MIN_LOCK_DURATION || duration > MAX_LOCK_DURATION) revert InvalidDuration();
        if (accountReputationBps < MIN_REPUTATION_BPS || accountReputationBps > MAX_REPUTATION_BPS) {
            revert InvalidReputation();
        }
        uint256 normalizedAmount = amount * (10 ** (18 - ydDecimals));
        uint256 durationBps = 10_000 + (
            uint256(duration - MIN_LOCK_DURATION) * 30_000 / (MAX_LOCK_DURATION - MIN_LOCK_DURATION)
        );
        return Math.sqrt(normalizedAmount) * durationBps / 10_000 * accountReputationBps / 10_000;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _validateAmountAndDuration(uint256 amount, uint64 duration) private view {
        if (amount == 0) revert InvalidAmount();
        if (amount > maxLockedPerAccount) revert LockLimitExceeded();
        if (duration < MIN_LOCK_DURATION || duration > MAX_LOCK_DURATION) revert InvalidDuration();
    }

    function _refreshPower(address account) private {
        Position memory position = positions[account];
        uint256 previous = _rawPower[account];
        uint256 next = position.amount == 0
            || !verifiedAccounts[account]
            || block.timestamp >= position.unlockTime
            ? 0
            : powerFor(position.amount, position.duration, reputationBps(account));
        if (next > maxPowerPerAccount) revert PowerLimitExceeded();
        _rawPower[account] = next;
        if (next > previous) _transferVotingUnits(address(0), account, next - previous);
        if (previous > next) _transferVotingUnits(account, address(0), previous - next);
    }

    function _withdraw(address account, uint256 amount, bool emergency) private {
        delete positions[account];
        _refreshPower(account);
        ydToken.safeTransfer(account, amount);
        emit PositionWithdrawn(account, amount, emergency);
    }

    function _emitPosition(address account) private {
        Position memory position = positions[account];
        emit PositionChanged(account, position.amount, position.unlockTime, position.duration, _rawPower[account]);
    }

    function _getVotingUnits(address account) internal view override returns (uint256) {
        return _rawPower[account];
    }
}

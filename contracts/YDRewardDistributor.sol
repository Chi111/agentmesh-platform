// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Treasury-prefunded, immutable-root PM reward epochs.
/// @dev This contract cannot mint PM and cannot spend funds reserved by another epoch.
contract YDRewardDistributor is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ROOT_MANAGER_ROLE = keccak256("ROOT_MANAGER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct Epoch {
        bytes32 merkleRoot;
        uint256 totalAllocation;
        uint256 totalClaimed;
        uint64 claimEndsAt;
        bool swept;
    }

    IERC20 public immutable ydToken;
    address public immutable treasury;
    uint256 public outstandingCommitments;

    mapping(uint256 epochId => Epoch epoch) public epochs;
    mapping(uint256 epochId => mapping(address account => bool claimed)) public hasClaimed;

    event EpochPublished(uint256 indexed epochId, bytes32 indexed merkleRoot, uint256 totalAllocation, uint64 claimEndsAt);
    event RewardClaimed(uint256 indexed epochId, address indexed account, uint256 amount);
    event EpochSwept(uint256 indexed epochId, uint256 unclaimedAmount);
    event ExcessRecovered(address indexed treasury, uint256 amount);

    error InvalidAddress();
    error InvalidEpoch();
    error EpochAlreadyPublished();
    error EpochExpired();
    error EpochStillActive();
    error EpochAlreadySwept();
    error InvalidProof();
    error AlreadyClaimed();
    error AllocationExceeded();
    error InsufficientPrefunding(uint256 required, uint256 available);
    error InsufficientExcess(uint256 requested, uint256 available);

    constructor(address tokenAddress, address treasuryAddress, address admin) {
        if (tokenAddress == address(0) || treasuryAddress == address(0) || admin == address(0)) revert InvalidAddress();
        ydToken = IERC20(tokenAddress);
        treasury = treasuryAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ROOT_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(TREASURY_ROLE, treasuryAddress);
    }

    function publishEpoch(uint256 epochId, bytes32 merkleRoot, uint256 totalAllocation, uint64 claimEndsAt)
        external
        onlyRole(ROOT_MANAGER_ROLE)
        whenNotPaused
    {
        if (epochId == 0 || merkleRoot == bytes32(0) || totalAllocation == 0 || claimEndsAt <= block.timestamp) {
            revert InvalidEpoch();
        }
        if (epochs[epochId].merkleRoot != bytes32(0)) revert EpochAlreadyPublished();

        uint256 requiredBalance = outstandingCommitments + totalAllocation;
        uint256 availableBalance = ydToken.balanceOf(address(this));
        if (availableBalance < requiredBalance) revert InsufficientPrefunding(requiredBalance, availableBalance);

        epochs[epochId] = Epoch({
            merkleRoot: merkleRoot,
            totalAllocation: totalAllocation,
            totalClaimed: 0,
            claimEndsAt: claimEndsAt,
            swept: false
        });
        outstandingCommitments = requiredBalance;
        emit EpochPublished(epochId, merkleRoot, totalAllocation, claimEndsAt);
    }

    function rewardLeaf(uint256 epochId, address account, uint256 amount) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), epochId, account, amount));
    }

    function claim(uint256 epochId, uint256 amount, bytes32[] calldata proof) external nonReentrant whenNotPaused {
        Epoch storage epoch = epochs[epochId];
        if (epoch.merkleRoot == bytes32(0) || amount == 0) revert InvalidEpoch();
        if (block.timestamp > epoch.claimEndsAt || epoch.swept) revert EpochExpired();
        if (hasClaimed[epochId][msg.sender]) revert AlreadyClaimed();
        if (!MerkleProof.verifyCalldata(proof, epoch.merkleRoot, rewardLeaf(epochId, msg.sender, amount))) {
            revert InvalidProof();
        }
        if (epoch.totalClaimed + amount > epoch.totalAllocation) revert AllocationExceeded();

        hasClaimed[epochId][msg.sender] = true;
        epoch.totalClaimed += amount;
        outstandingCommitments -= amount;
        ydToken.safeTransfer(msg.sender, amount);
        emit RewardClaimed(epochId, msg.sender, amount);
    }

    function sweepExpired(uint256 epochId) external onlyRole(TREASURY_ROLE) nonReentrant {
        Epoch storage epoch = epochs[epochId];
        if (epoch.merkleRoot == bytes32(0)) revert InvalidEpoch();
        if (block.timestamp <= epoch.claimEndsAt) revert EpochStillActive();
        if (epoch.swept) revert EpochAlreadySwept();

        epoch.swept = true;
        uint256 unclaimed = epoch.totalAllocation - epoch.totalClaimed;
        outstandingCommitments -= unclaimed;
        if (unclaimed > 0) ydToken.safeTransfer(treasury, unclaimed);
        emit EpochSwept(epochId, unclaimed);
    }

    function recoverExcess(uint256 amount) external onlyRole(TREASURY_ROLE) nonReentrant {
        uint256 balance = ydToken.balanceOf(address(this));
        uint256 available = balance > outstandingCommitments ? balance - outstandingCommitments : 0;
        if (amount == 0 || amount > available) revert InsufficientExcess(amount, available);
        ydToken.safeTransfer(treasury, amount);
        emit ExcessRecovered(treasury, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}

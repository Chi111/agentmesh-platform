// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply YD used only for AgentMesh testnet rehearsals.
/// @dev The entire supply is minted once. This contract deliberately exposes no mint function.
contract TestYDToken is ERC20 {
    error InvalidTreasury();
    error InvalidSupply();

    constructor(address treasury, uint256 fixedSupply) ERC20("AgentMesh Test YD", "tYD") {
        if (treasury == address(0)) revert InvalidTreasury();
        if (fixedSupply == 0) revert InvalidSupply();
        _mint(treasury, fixedSupply);
    }
}

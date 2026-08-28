// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply contribution token used only for pinme-mesh testnet rehearsals.
/// @dev The entire supply is minted once. This contract deliberately exposes no mint function.
contract TestYDToken is ERC20 {
    error InvalidTreasury();
    error InvalidSupply();

    constructor(address treasury, uint256 fixedSupply, string memory tokenName, string memory tokenSymbol)
        ERC20(tokenName, tokenSymbol)
    {
        if (treasury == address(0)) revert InvalidTreasury();
        if (fixedSupply == 0) revert InvalidSupply();
        _mint(treasury, fixedSupply);
    }
}

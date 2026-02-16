import { expect } from "chai";
import { ethers } from "hardhat";
import type { MockFeeCalculator } from "../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers.js";

describe("MockFeeCalculator", function () {
  let feeCalc: MockFeeCalculator;
  let owner: HardhatEthersSigner;
  let nonOwner: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("MockFeeCalculator");
    feeCalc = (await factory.deploy(0n)) as MockFeeCalculator;
  });

  describe("deployment", function () {
    it("sets initial fee to 0", async function () {
      expect(await feeCalc.getFee()).to.equal(0n);
    });

    it("sets deployer as owner", async function () {
      expect(await feeCalc.owner()).to.equal(owner.address);
    });

    it("can be deployed with non-zero initial fee", async function () {
      const factory = await ethers.getContractFactory("MockFeeCalculator");
      const feeCalcWith1Gwei = await factory.deploy(1_000_000_000n);
      expect(await feeCalcWith1Gwei.getFee()).to.equal(1_000_000_000n);
    });
  });

  describe("calculateFeeByIds()", function () {
    it("returns 0 by default", async function () {
      const fee = await feeCalc.calculateFeeByIds("0x");
      expect(fee).to.equal(0n);
    });

    it("returns configured fee regardless of calldata input", async function () {
      await feeCalc.setFee(500_000n);

      // Should return same fee for any calldata
      expect(await feeCalc.calculateFeeByIds("0x")).to.equal(500_000n);
      expect(await feeCalc.calculateFeeByIds("0xdeadbeef")).to.equal(500_000n);
      expect(await feeCalc.calculateFeeByIds("0x" + "aa".repeat(100))).to.equal(500_000n);
    });
  });

  describe("setFee()", function () {
    it("updates the fee", async function () {
      await feeCalc.setFee(1_000_000_000n);
      expect(await feeCalc.getFee()).to.equal(1_000_000_000n);
    });

    it("can set fee back to 0", async function () {
      await feeCalc.setFee(1_000_000_000n);
      await feeCalc.setFee(0n);
      expect(await feeCalc.getFee()).to.equal(0n);
    });

    it("emits FeeSet event with old and new values", async function () {
      await expect(feeCalc.setFee(100n))
        .to.emit(feeCalc, "FeeSet")
        .withArgs(0n, 100n);

      await expect(feeCalc.setFee(200n))
        .to.emit(feeCalc, "FeeSet")
        .withArgs(100n, 200n);
    });

    it("reverts when called by non-owner", async function () {
      await expect(feeCalc.connect(nonOwner).setFee(100n)).to.be.revertedWithCustomError(
        feeCalc,
        "Unauthorized"
      );
    });
  });
});

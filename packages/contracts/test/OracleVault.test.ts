import { expect } from "chai";
import { ethers } from "hardhat";
import type {
  MockFTSOv2,
  MockERC20,
  OracleVault,
} from "../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers.js";

// FLR/USD feed ID (bytes21: category 0x01, symbol "FLR/USD" zero-padded)
const FLR_USD_ID = "0x01464c522f55534400000000000000000000000000";

/** Returns the latest EVM block timestamp (not JS Date.now which drifts). */
async function evmNow(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("OracleVault", function () {
  let mock: MockFTSOv2;
  let wflr: MockERC20;
  let vault: OracleVault;
  let owner: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let now: bigint; // EVM block timestamp captured after all deployments

  const DEPOSIT_AMOUNT = ethers.parseEther("100"); // 100 wFLR

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy contracts (each mines a block, advancing EVM time)
    const MockFTSOv2Factory = await ethers.getContractFactory("MockFTSOv2");
    mock = (await MockFTSOv2Factory.deploy()) as MockFTSOv2;

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    wflr = (await MockERC20Factory.deploy("Wrapped FLR", "wFLR")) as MockERC20;

    const OracleVaultFactory = await ethers.getContractFactory("OracleVault");
    vault = (await OracleVaultFactory.deploy(
      wflr.target,
      mock.target
    )) as OracleVault;

    // Capture EVM time AFTER all deployments so `now` matches block.timestamp
    now = await evmNow();

    // Set initial FLR/USD price: 1.0 USD/FLR (100000 with 5 decimals)
    await mock.setPrice(FLR_USD_ID, 100000n, 5, now);
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("deployment", function () {
    it("sets deployer as owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("sets wFLR token address correctly", async function () {
      expect(await vault.wFLR()).to.equal(wflr.target);
    });

    it("FLR_USD_FEED_ID constant is correct", async function () {
      expect(await vault.FLR_USD_FEED_ID()).to.equal(FLR_USD_ID);
    });

    it("sets initial staleness to 120 seconds", async function () {
      expect(await vault.getMaxStaleness(FLR_USD_ID)).to.equal(120n);
    });

    it("sets initial deviation to 1000 bps (10%)", async function () {
      expect(await vault.getMaxDeviationBps(FLR_USD_ID)).to.equal(1000n);
    });

    it("reverts on zero wFLR address", async function () {
      const Factory = await ethers.getContractFactory("OracleVault");
      await expect(
        Factory.deploy(ethers.ZeroAddress, mock.target)
      ).to.be.revertedWith("OracleVault: zero wFLR address");
    });

    it("reverts on zero ftsoV2 address", async function () {
      const Factory = await ethers.getContractFactory("OracleVault");
      await expect(
        Factory.deploy(wflr.target, ethers.ZeroAddress)
      ).to.be.revertedWith("FTSOGuard: zero address");
    });
  });

  // ── Deposit ────────────────────────────────────────────────────────────────

  describe("deposit()", function () {
    beforeEach(async function () {
      await wflr.mint(user.address, DEPOSIT_AMOUNT);
      await wflr.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
    });

    it("accepts wFLR deposit and updates balance", async function () {
      await vault.connect(user).deposit(DEPOSIT_AMOUNT);
      expect(await vault.deposits(user.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("transfers wFLR from user to vault", async function () {
      await vault.connect(user).deposit(DEPOSIT_AMOUNT);
      expect(await wflr.balanceOf(vault.target)).to.equal(DEPOSIT_AMOUNT);
      expect(await wflr.balanceOf(user.address)).to.equal(0n);
    });

    it("emits Deposited event", async function () {
      await expect(vault.connect(user).deposit(DEPOSIT_AMOUNT))
        .to.emit(vault, "Deposited")
        .withArgs(user.address, DEPOSIT_AMOUNT);
    });

    it("accumulates multiple deposits from same user", async function () {
      const half = DEPOSIT_AMOUNT / 2n;
      // Mint an additional half so the user has 1.5x the deposit amount
      await wflr.mint(user.address, half);
      await wflr.connect(user).approve(vault.target, DEPOSIT_AMOUNT + half);

      await vault.connect(user).deposit(half);
      await vault.connect(user).deposit(half);
      expect(await vault.deposits(user.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("reverts with ZeroAmount for zero deposit", async function () {
      await expect(
        vault.connect(user).deposit(0)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("reverts when user has insufficient token allowance", async function () {
      // Revoke approval
      await wflr.connect(user).approve(vault.target, 0);
      await expect(
        vault.connect(user).deposit(DEPOSIT_AMOUNT)
      ).to.be.reverted; // SafeERC20 reverts on insufficient allowance
    });
  });

  // ── Withdraw ───────────────────────────────────────────────────────────────

  describe("withdraw()", function () {
    beforeEach(async function () {
      // Fund user with wFLR and deposit into vault
      await wflr.mint(user.address, DEPOSIT_AMOUNT);
      await wflr.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
      await vault.connect(user).deposit(DEPOSIT_AMOUNT);
    });

    it("returns wFLR to user on withdrawal", async function () {
      await vault.connect(user).withdraw(DEPOSIT_AMOUNT, { value: 0n });
      expect(await wflr.balanceOf(user.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("decreases user deposit balance", async function () {
      await vault.connect(user).withdraw(DEPOSIT_AMOUNT, { value: 0n });
      expect(await vault.deposits(user.address)).to.equal(0n);
    });

    it("emits Withdrawn event with USD value", async function () {
      // Price: 100000 with 5 decimals = 1.0 USD/FLR
      // USD value = 100e18 wFLR * 100000 / 10^5 = 100e18
      const expectedUsdValue = (DEPOSIT_AMOUNT * 100000n) / 10n ** 5n;

      await expect(
        vault.connect(user).withdraw(DEPOSIT_AMOUNT, { value: 0n })
      )
        .to.emit(vault, "Withdrawn")
        .withArgs(user.address, DEPOSIT_AMOUNT, expectedUsdValue);
    });

    it("partial withdrawal leaves remaining balance", async function () {
      const half = DEPOSIT_AMOUNT / 2n;
      await vault.connect(user).withdraw(half, { value: 0n });
      expect(await vault.deposits(user.address)).to.equal(half);
    });

    it("reverts with ZeroAmount for zero withdrawal", async function () {
      await expect(
        vault.connect(user).withdraw(0, { value: 0n })
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("reverts with InsufficientBalance when withdrawing more than deposited", async function () {
      const tooMuch = DEPOSIT_AMOUNT + 1n;
      await expect(
        vault.connect(user).withdraw(tooMuch, { value: 0n })
      )
        .to.be.revertedWithCustomError(vault, "InsufficientBalance")
        .withArgs(tooMuch, DEPOSIT_AMOUNT);
    });

    // ── FTSOGuard circuit breakers triggered during withdraw ──────────────

    it("reverts with StalePrice when oracle price is stale", async function () {
      // OracleVault constructor sets staleness limit to 120s
      const staleTime = now - 121n; // 121 seconds in EVM past → stale
      await mock.setPrice(FLR_USD_ID, 100000n, 5, staleTime);

      await expect(
        vault.connect(user).withdraw(DEPOSIT_AMOUNT, { value: 0n })
      ).to.be.revertedWithCustomError(vault, "StalePrice");
    });

    it("reverts with InvalidPrice when oracle returns zero price", async function () {
      await mock.setZeroPrice(FLR_USD_ID);

      await expect(
        vault.connect(user).withdraw(DEPOSIT_AMOUNT, { value: 0n })
      ).to.be.revertedWithCustomError(vault, "InvalidPrice");
    });

    it("reverts with PriceDeviation when price jumps > 10%", async function () {
      // First withdrawal establishes reference price at 100000
      const half = DEPOSIT_AMOUNT / 2n;
      await vault.connect(user).withdraw(half, { value: 0n });

      // Price jumps 20% → triggers deviation check on second withdrawal
      const freshTime = await evmNow();
      await mock.setPrice(FLR_USD_ID, 120000n, 5, freshTime);
      await expect(
        vault.connect(user).withdraw(half, { value: 0n })
      ).to.be.revertedWithCustomError(vault, "PriceDeviation");
    });
  });

  // ── E2E: full deposit → withdraw cycle ────────────────────────────────────

  describe("E2E: deposit → withdraw", function () {
    it("completes a full deposit-withdraw cycle against MockFTSOv2", async function () {
      // 1. Mint and approve
      await wflr.mint(user.address, DEPOSIT_AMOUNT);
      await wflr.connect(user).approve(vault.target, DEPOSIT_AMOUNT);

      // 2. Deposit
      await vault.connect(user).deposit(DEPOSIT_AMOUNT);
      expect(await vault.deposits(user.address)).to.equal(DEPOSIT_AMOUNT);
      expect(await wflr.balanceOf(vault.target)).to.equal(DEPOSIT_AMOUNT);

      // 3. Withdraw
      const tx = await vault
        .connect(user)
        .withdraw(DEPOSIT_AMOUNT, { value: 0n });
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      // 4. Assert final state
      expect(await vault.deposits(user.address)).to.equal(0n);
      expect(await wflr.balanceOf(user.address)).to.equal(DEPOSIT_AMOUNT);
      expect(await wflr.balanceOf(vault.target)).to.equal(0n);
    });

    it("vault records correct USD value with different FTSO decimal scales", async function () {
      // Set price: 0.05 USD/FLR → rawPrice=5000, decimals=5 (5000/10^5 = 0.05)
      const freshTime = await evmNow();
      await mock.setPrice(FLR_USD_ID, 5000n, 5, freshTime);

      await wflr.mint(user.address, DEPOSIT_AMOUNT);
      await wflr.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
      await vault.connect(user).deposit(DEPOSIT_AMOUNT);

      // USD value = 100e18 * 5000 / 10^5 = 5e18
      const expectedUsd = (DEPOSIT_AMOUNT * 5000n) / 100_000n;

      await expect(vault.connect(user).withdraw(DEPOSIT_AMOUNT, { value: 0n }))
        .to.emit(vault, "Withdrawn")
        .withArgs(user.address, DEPOSIT_AMOUNT, expectedUsd);
    });
  });

  // ── Owner configuration ────────────────────────────────────────────────────

  describe("owner configuration", function () {
    it("owner can update staleness limit", async function () {
      await vault.setMaxStaleness(60);
      expect(await vault.getMaxStaleness(FLR_USD_ID)).to.equal(60n);
    });

    it("owner can update deviation limit", async function () {
      await vault.setMaxDeviation(500);
      expect(await vault.getMaxDeviationBps(FLR_USD_ID)).to.equal(500n);
    });

    it("non-owner cannot update staleness", async function () {
      await expect(
        vault.connect(user).setMaxStaleness(60)
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("non-owner cannot update deviation", async function () {
      await expect(
        vault.connect(user).setMaxDeviation(500)
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("getDeposit() returns same value as deposits mapping", async function () {
      await wflr.mint(user.address, DEPOSIT_AMOUNT);
      await wflr.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
      await vault.connect(user).deposit(DEPOSIT_AMOUNT);

      expect(await vault.getDeposit(user.address)).to.equal(
        await vault.deposits(user.address)
      );
    });
  });
});

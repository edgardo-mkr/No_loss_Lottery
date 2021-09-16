const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
//requirements for test-helper openzeppelin plugin 
const { BN } = require("@openzeppelin/test-helpers/src/setup");
const balance = require('@openzeppelin/test-helpers/src/balance');
const time = require("@openzeppelin/test-helpers/src/time");
require('@openzeppelin/test-helpers/src/setup');

const provider = ethers.provider;

const erc20Abi = [
    "function transfer(address recipient, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)"
]

const hre = require("hardhat");
const { isCallTrace } = require('hardhat/internal/hardhat-network/stack-traces/message-trace');

const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const busdAddress = "0x4Fabb145d64652a948d72533023f6E7A623C7C53";
const usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const tusdAddress = "0x0000000000085d4780B73119b644AE5ecd22b376";
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const linkAddress = "0x514910771AF9Ca656af840dff83E8264EcF986CA"

const daiContract = new ethers.Contract(daiAddress, erc20Abi, provider);
const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, provider);
const busdContract = new ethers.Contract(busdAddress, erc20Abi, provider);
const usdtContract = new ethers.Contract(usdtAddress, erc20Abi, provider);
const tusdContract = new ethers.Contract(tusdAddress, erc20Abi, provider);
const linkContract = new ethers.Contract(linkAddress, erc20Abi, provider);

const requestId = "0x0000000000000000000000000000000000000000000000000000000000000001"

describe("LotteryV1 contract", async function(){
    
    let vrfCoordinator;
    let vrfCoordinatorMock;
    let Lottery;
    let hardhatLottery;
    let buyerWithToken;
    let tusdHolder;
    let owner;
    let recipient;
    let addr1;
    let addrs;

    beforeEach(async function() {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503"],
        });
        //setting his balance to 1000 ETH 
        await network.provider.send("hardhat_setBalance", [
            "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
            "0x3635c9adc5dea00000",
          ]);
        buyerWithToken = await ethers.getSigner("0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503");
        
        //impersonating tusd holder
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x345D8e3A1F62eE6B1D483890976fD66168e390F2"],
        });
        await network.provider.send("hardhat_setBalance", [
            "0x345D8e3A1F62eE6B1D483890976fD66168e390F2",
            "0x3635c9adc5dea00000",
          ]);
        tusdHolder =await ethers.getSigner("0x345D8e3A1F62eE6B1D483890976fD66168e390F2")
        
        vrfCoordinator = await ethers.getContractFactory("VRFCoordinatorMock");
        vrfCoordinatorMock = await vrfCoordinator.deploy(linkAddress)

        Lottery = await ethers.getContractFactory("LotteryV1");
        [owner, recipient, addr1, ...addrs] = await ethers.getSigners();
        hardhatLottery = await upgrades.deployProxy(Lottery, [recipient.address, vrfCoordinatorMock.address]);

        await hardhatLottery.initFundingStage();
        await linkContract.connect(buyerWithToken).transfer(hardhatLottery.address, ethers.utils.parseUnits('10.0', 18))
    })

    describe("Initialization", function() {
        it("Should set the right owner and recipient", async function () {
            expect(await hardhatLottery.owner()).to.equal(owner.address);
            expect(await hardhatLottery.recipient()).to.equal(recipient.address);
        })
    })

    describe("Buying tickets with each coin", function() {
        it("Should buy 100 tickets with dai", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            

            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(buyerWithToken.address)

            
            expect(balances.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)

        })
        it("Should buy 100 tickets with usdc", async function() {
            await usdcContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 6))
            

            await hardhatLottery.connect(buyerWithToken).buyTickets(usdcAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(buyerWithToken.address)

            
            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1000.0', 18), ethers.utils.parseUnits('1.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets with busd", async function() {
            await busdContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            

            await hardhatLottery.connect(buyerWithToken).buyTickets(busdAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(buyerWithToken.address)

            
            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1000.0', 18), ethers.utils.parseUnits('10.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets with usdt", async function() {
            await usdtContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 6))
            

            await hardhatLottery.connect(buyerWithToken).buyTickets(usdtAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(buyerWithToken.address)

            
            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1000.0', 18), ethers.utils.parseUnits('1.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets with tusd", async function() {
            await tusdContract.connect(tusdHolder).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            

            await hardhatLottery.connect(tusdHolder).buyTickets(tusdAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(tusdHolder.address)

            
            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1000.0', 18), ethers.utils.parseUnits('1.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(tusdHolder.address)
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets with eth", async function() {
            

            await hardhatLottery.connect(buyerWithToken).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("2.0")});

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(buyerWithToken.address)

            
            expect(balances.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
    })

    describe("completing a lottery", function (){
        it("Should reward the right winner", async function() {
            
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);

            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            expect(await hardhatLottery.purchase()).to.equal(3)
            expect(await hardhatLottery.totalTickets()).to.equal(300)
            expect(await hardhatLottery.totalFunds()).to.equal(ethers.utils.parseUnits('3000.0', 18))
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(ethers.utils.parseUnits('3000.0', 18))
            
            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();

            await vrfCoordinatorMock.callBackWithRandomness(requestId, '250', hardhatLottery.address)

            let excessDai = BigInt(await daiContract.balanceOf(addr1.address))
            let depositedBalance = await hardhatLottery.balances(addr1.address)
            depositedBalance = BigInt(depositedBalance.amount)

            await hardhatLottery.chooseWinner()

            let winnerDaiBalance = BigInt(await daiContract.balanceOf(addr1.address))
            let feesEarn = winnerDaiBalance - depositedBalance - excessDai

            let recipientFees = feesEarn*BigInt(5)/BigInt(95)

            let winnerOnLotteryBalance = await hardhatLottery.balances(addr1.address)
            let ownerOnLotteryBalance = await hardhatLottery.balances(owner.address)
            let buyerOnLotteryBalance = await hardhatLottery.balances(buyerWithToken.address)
            
            expect(Number(feesEarn)).to.be.above(0)
            expect(await daiContract.balanceOf(recipient.address)).to.equal(recipientFees)
            expect(winnerOnLotteryBalance.amount).to.equal(0)
            expect(ownerOnLotteryBalance.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(buyerOnLotteryBalance.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
             
        })

        it("Should reward right winner on multiple lotteries", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '130', hardhatLottery.address)

            let excessDai = BigInt(await daiContract.balanceOf(owner.address))
            let depositedBalance = await hardhatLottery.balances(owner.address)
            depositedBalance = BigInt(depositedBalance.amount)

            await hardhatLottery.chooseWinner()

            let winnerDaiBalance = BigInt(await daiContract.balanceOf(owner.address))
            let feesEarn = winnerDaiBalance - depositedBalance - excessDai

            let winnerOnLotteryBalance = await hardhatLottery.balances(owner.address)
            let addr1OnLotteryBalance = await hardhatLottery.balances(addr1.address)
            let buyerOnLotteryBalance = await hardhatLottery.balances(buyerWithToken.address)

            expect(Number(feesEarn)).to.be.above(0)
            expect(winnerOnLotteryBalance.amount).to.equal(0)
            expect(addr1OnLotteryBalance.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(buyerOnLotteryBalance.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))

            //SECOND LOTTERY
            await hardhatLottery.initFundingStage();

            expect(await hardhatLottery.lotteryId()).to.equal(2)
            expect(await hardhatLottery.purchase()).to.equal(0)
            expect(await hardhatLottery.totalTickets()).to.equal(0)
            expect(await hardhatLottery.totalFunds()).to.equal(0)

            //buying tickets with balances
            await hardhatLottery.connect(buyerWithToken).buyTicketsWithBalance();
            await hardhatLottery.connect(addr1).buyTicketsWithBalance();

            //winner participating again
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '69', hardhatLottery.address)

            excessDai = BigInt(await daiContract.balanceOf(buyerWithToken.address))
            depositedBalance = await hardhatLottery.balances(buyerWithToken.address)
            depositedBalance = BigInt(depositedBalance.amount)

            await hardhatLottery.chooseWinner()

            winnerDaiBalance = BigInt(await daiContract.balanceOf(buyerWithToken.address))
            feesEarn = winnerDaiBalance - depositedBalance - excessDai

            winnerOnLotteryBalance = await hardhatLottery.balances(buyerWithToken.address)
            addr1OnLotteryBalance = await hardhatLottery.balances(addr1.address)
            let ownerOnLotteryBalance = await hardhatLottery.balances(owner.address)

            expect(Number(feesEarn)).to.be.above(0)
            expect(winnerOnLotteryBalance.amount).to.equal(0)
            expect(winnerOnLotteryBalance.lottery).to.equal(2)
            expect(addr1OnLotteryBalance.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(addr1OnLotteryBalance.lottery).to.equal(2)
            expect(ownerOnLotteryBalance.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(ownerOnLotteryBalance.lottery).to.equal(2)
        })

        it("Should add tickets and deposits for next lottery", async function () {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await tusdContract.connect(tusdHolder).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(tusdHolder).buyTicketsAfterInit(tusdAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(2, 1)
            let balances = await hardhatLottery.balances(tusdHolder.address)

            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(tusdHolder.address)
            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1000.0', 18), ethers.utils.parseUnits('1.0', 18))
            expect(balances.lottery).to.equal(2)
            expect(await hardhatLottery.totalFunds()).to.equal(ethers.utils.parseUnits('3000.0', 18))
            expect(await hardhatLottery.totalTickets()).to.equal(300)
            expect(await hardhatLottery.purchase()).to.equal(3)
            expect(await hardhatLottery.totalFundsAfterInit()).to.equal(balances.amount)
            expect(await hardhatLottery.totalTicketsAfterInit()).to.equal(100)
            expect(await hardhatLottery.purchaseAfterInit()).to.equal(1)

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '130', hardhatLottery.address)
            await hardhatLottery.chooseWinner()

            //SECOND LOTTERY
            await hardhatLottery.initFundingStage();

            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await hardhatLottery.totalTickets()).to.equal(100)
            expect(await hardhatLottery.purchase()).to.equal(1)
            expect(await hardhatLottery.totalFundsAfterInit()).to.equal(0)
            expect(await hardhatLottery.totalTicketsAfterInit()).to.equal(0)
            expect(await hardhatLottery.purchaseAfterInit()).to.equal(0)


            await hardhatLottery.connect(buyerWithToken).buyTicketsWithBalance();
            await hardhatLottery.connect(addr1).buyTicketsWithBalance();

            let purchaseBuyer = await hardhatLottery.ticketOwners(2, 2)
            let balancesBuyer = await hardhatLottery.balances(buyerWithToken.address)

            let purchaseAddr1 = await hardhatLottery.ticketOwners(2, 3)
            let balancesAddr1 = await hardhatLottery.balances(addr1.address)

            expect(purchaseBuyer.firstTicket).to.equal(101)
            expect(purchaseBuyer.lastTicket).to.equal(200)
            expect(purchaseBuyer.buyer).to.equal(buyerWithToken.address)
            expect(balancesBuyer.lottery).to.equal(2)
            expect(purchaseAddr1.firstTicket).to.equal(201)
            expect(purchaseAddr1.lastTicket).to.equal(300)
            expect(purchaseAddr1.buyer).to.equal(addr1.address)
            expect(balancesAddr1.lottery).to.equal(2)
            expect(await hardhatLottery.totalFunds()).to.equal(BigInt(balances.amount) + BigInt(ethers.utils.parseUnits('2000.0', 18)))
            
        })
    })

    describe("Buying multiple sets of tickets on a lottery", function () {
        it("Should buy 100 tickets and then 50 tickets with dai on the same lottery", async function(){
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);

            

            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('500.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 50);
            
            let purchase = await hardhatLottery.ticketOwners(1, 1)
            let purchase2 = await hardhatLottery.ticketOwners(1, 2)
            let balances = await hardhatLottery.balances(buyerWithToken.address)

            expect(balances.amount).to.equal(ethers.utils.parseUnits('1500.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(purchase2.firstTicket).to.equal(101)
            expect(purchase2.lastTicket).to.equal(150)
            expect(purchase2.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(2)
            expect(await hardhatLottery.totalTickets()).to.equal(150)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets and then 50 tickets with busd on the same lottery", async function(){
            await busdContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(busdAddress, 100);

            

            await busdContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('500.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(busdAddress, 50);
            
            let purchase = await hardhatLottery.ticketOwners(1, 1)
            let purchase2 = await hardhatLottery.ticketOwners(1, 2)
            let balances = await hardhatLottery.balances(buyerWithToken.address)

            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1500.0', 18), ethers.utils.parseUnits('2.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(purchase2.firstTicket).to.equal(101)
            expect(purchase2.lastTicket).to.equal(150)
            expect(purchase2.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(2)
            expect(await hardhatLottery.totalTickets()).to.equal(150)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets and then 50 tickets with usdt on the same lottery", async function(){
            await usdtContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 6))
            await hardhatLottery.connect(buyerWithToken).buyTickets(usdtAddress, 100);

            

            await usdtContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('500.0', 6))
            await hardhatLottery.connect(buyerWithToken).buyTickets(usdtAddress, 50);
            
            let purchase = await hardhatLottery.ticketOwners(1, 1)
            let purchase2 = await hardhatLottery.ticketOwners(1, 2)
            let balances = await hardhatLottery.balances(buyerWithToken.address)

            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1500.0', 18), ethers.utils.parseUnits('1.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(purchase2.firstTicket).to.equal(101)
            expect(purchase2.lastTicket).to.equal(150)
            expect(purchase2.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(2)
            expect(await hardhatLottery.totalTickets()).to.equal(150)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets and then 50 tickets with usdc on the same lottery", async function(){
            await usdcContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 6))
            await hardhatLottery.connect(buyerWithToken).buyTickets(usdcAddress, 100);

            

            await usdcContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('500.0', 6))
            await hardhatLottery.connect(buyerWithToken).buyTickets(usdcAddress, 50);
            
            let purchase = await hardhatLottery.ticketOwners(1, 1)
            let purchase2 = await hardhatLottery.ticketOwners(1, 2)
            let balances = await hardhatLottery.balances(buyerWithToken.address)

            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1500.0', 18), ethers.utils.parseUnits('2.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
            expect(purchase2.firstTicket).to.equal(101)
            expect(purchase2.lastTicket).to.equal(150)
            expect(purchase2.buyer).to.equal(buyerWithToken.address)
            expect(await hardhatLottery.purchase()).to.equal(2)
            expect(await hardhatLottery.totalTickets()).to.equal(150)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets and then 50 tickets with tusd on the same lottery", async function(){
            await tusdContract.connect(tusdHolder).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(tusdHolder).buyTickets(tusdAddress, 100);

            

            await tusdContract.connect(tusdHolder).approve(hardhatLottery.address, ethers.utils.parseUnits('500.0', 18))
            await hardhatLottery.connect(tusdHolder).buyTickets(tusdAddress, 50);
            
            let purchase = await hardhatLottery.ticketOwners(1, 1)
            let purchase2 = await hardhatLottery.ticketOwners(1, 2)
            let balances = await hardhatLottery.balances(tusdHolder.address)

            expect(balances.amount).to.be.closeTo(ethers.utils.parseUnits('1500.0', 18), ethers.utils.parseUnits('2.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(tusdHolder.address)
            expect(purchase2.firstTicket).to.equal(101)
            expect(purchase2.lastTicket).to.equal(150)
            expect(purchase2.buyer).to.equal(tusdHolder.address)
            expect(await hardhatLottery.purchase()).to.equal(2)
            expect(await hardhatLottery.totalTickets()).to.equal(150)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
        it("Should buy 100 tickets and then 50 tickets with eth on the same lottery", async function(){
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.buyTickets(ethAddress, 50,{value: ethers.utils.parseEther("1.0")});
            
            let purchase = await hardhatLottery.ticketOwners(1, 1)
            let purchase2 = await hardhatLottery.ticketOwners(1, 2)
            let balances = await hardhatLottery.balances(owner.address)

            expect(balances.amount).to.equal(ethers.utils.parseUnits('1500.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(owner.address)
            expect(purchase2.firstTicket).to.equal(101)
            expect(purchase2.lastTicket).to.equal(150)
            expect(purchase2.buyer).to.equal(owner.address)
            expect(await hardhatLottery.purchase()).to.equal(2)
            expect(await hardhatLottery.totalTickets()).to.equal(150)
            expect(await hardhatLottery.totalFunds()).to.equal(balances.amount)
            expect(await daiContract.balanceOf(hardhatLottery.address)).to.equal(balances.amount)
        })
    })

    describe("withdrawal", function() {
        it("should allow to withdraw after the lottery ends", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '130', hardhatLottery.address)
            await hardhatLottery.chooseWinner()

            await hardhatLottery.initFundingStage();

            let buyerDaiBalance = await daiContract.balanceOf(buyerWithToken.address)
            let addr1DaiBalance = await daiContract.balanceOf(addr1.address)

            let buyerLotteryBalance = await hardhatLottery.balances(buyerWithToken.address)
            let addr1LotteryBalance = await hardhatLottery.balances(addr1.address)

            await hardhatLottery.connect(buyerWithToken).withdrawal()
            await hardhatLottery.connect(addr1).withdrawal()
            
            let newBuyerDaiBalance = await daiContract.balanceOf(buyerWithToken.address)
            let newAddr1DaiBalance = await daiContract.balanceOf(addr1.address)

            let newBuyerLotteryBalance = await hardhatLottery.balances(buyerWithToken.address)
            let newAddr1LotteryBalance = await hardhatLottery.balances(addr1.address)

            expect(newBuyerLotteryBalance.amount).to.equal(0)
            expect(newAddr1LotteryBalance.amount).to.equal(0)
            expect(newBuyerDaiBalance).to.equal(BigInt(buyerDaiBalance)+BigInt(buyerLotteryBalance.amount))
            expect(newAddr1DaiBalance).to.equal(BigInt(addr1DaiBalance)+BigInt(addr1LotteryBalance.amount)) 
        })

        it("should revert when user is participating in current lottery", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await expect(hardhatLottery.connect(buyerWithToken).withdrawal()).to.be.revertedWith("you can't withdraw while participating in a lottery")
            await expect(hardhatLottery.withdrawal()).to.be.revertedWith("you can't withdraw while participating in a lottery")
            await expect(hardhatLottery.connect(addr1).withdrawal()).to.be.revertedWith("you can't withdraw while participating in a lottery")
        })

        it("Should revert when user is participating for next week lottery", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await tusdContract.connect(tusdHolder).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(tusdHolder).buyTicketsAfterInit(tusdAddress, 100);

            await expect(hardhatLottery.connect(tusdHolder).withdrawal()).to.be.revertedWith("you can't withdraw while participating in a lottery")
        })
    })

    describe("Buying tickets with balance stored in lottery", function() {
        it("Should allow to buy ticket for a new lottery", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            let buyerBalance = await hardhatLottery.balances(buyerWithToken.address)
            let addr1Balance = await hardhatLottery.balances(addr1.address)

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '130', hardhatLottery.address)
            await hardhatLottery.chooseWinner()

            await hardhatLottery.initFundingStage();

            await hardhatLottery.connect(buyerWithToken).buyTicketsWithBalance()
            await hardhatLottery.connect(addr1).buyTicketsWithBalance()

            let buyerTickets = await hardhatLottery.connect(buyerWithToken).ticketOwners(2,1)
            let addr1Tickets = await hardhatLottery.connect(addr1).ticketOwners(2,2)
            let newBuyerBalance = await hardhatLottery.balances(buyerWithToken.address)
            let newAddr1Balance = await hardhatLottery.balances(addr1.address)

            expect(buyerTickets.firstTicket).to.equal(1)
            expect(buyerTickets.lastTicket).to.equal(100)
            expect(buyerTickets.buyer).to.equal(buyerWithToken.address)
            expect(addr1Tickets.firstTicket).to.equal(101)
            expect(addr1Tickets.lastTicket).to.equal(200)
            expect(addr1Tickets.buyer).to.equal(addr1.address)
            expect(newBuyerBalance.lottery).to.equal(2)
            expect(newAddr1Balance.lottery).to.equal(2)
            expect(newBuyerBalance.amount).to.equal(buyerBalance.amount)
            expect(newAddr1Balance.amount).to.equal(addr1Balance.amount)

        })
        it("Should allow to buy ticket for next week lottery", async function() {
            await daiContract.connect(buyerWithToken).approve(hardhatLottery.address, ethers.utils.parseUnits('1000.0', 18))
            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});

            let buyerBalance = await hardhatLottery.balances(buyerWithToken.address)
            let addr1Balance = await hardhatLottery.balances(addr1.address)

            await time.increase(time.duration.days(2));

            await hardhatLottery.initEarningStage()

            await time.increase(time.duration.days(5));

            await hardhatLottery.getRandomNumber();
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '130', hardhatLottery.address)
            await hardhatLottery.chooseWinner()

            await hardhatLottery.initFundingStage();
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
           
            await time.increase(time.duration.days(2));
           
            await hardhatLottery.initEarningStage()
           
            await hardhatLottery.connect(buyerWithToken).buyTicketsWithBalanceAfterInit()
            await hardhatLottery.connect(addr1).buyTicketsWithBalanceAfterInit()

            

            let buyerTickets = await hardhatLottery.connect(buyerWithToken).ticketOwners(3,1)
            let addr1Tickets = await hardhatLottery.connect(addr1).ticketOwners(3,2)
            let newBuyerBalance = await hardhatLottery.balances(buyerWithToken.address)
            let newAddr1Balance = await hardhatLottery.balances(addr1.address)

            expect(buyerTickets.firstTicket).to.equal(1)
            expect(buyerTickets.lastTicket).to.equal(100)
            expect(buyerTickets.buyer).to.equal(buyerWithToken.address)
            expect(addr1Tickets.firstTicket).to.equal(101)
            expect(addr1Tickets.lastTicket).to.equal(200)
            expect(addr1Tickets.buyer).to.equal(addr1.address)
            expect(newBuyerBalance.lottery).to.equal(3)
            expect(newAddr1Balance.lottery).to.equal(3)
            expect(newBuyerBalance.amount).to.equal(buyerBalance.amount)
            expect(newAddr1Balance.amount).to.equal(addr1Balance.amount)

        })
        it("Should revert when buying with zero balance in current lottery", async function() {
            await expect(hardhatLottery.buyTicketsWithBalance()).to.be.revertedWith("Balance is zero")
        })
        it("Should revert when buying with zero balance for next week lottery", async function() {
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await time.increase(time.duration.days(2));
            await hardhatLottery.initEarningStage()
            await expect(hardhatLottery.buyTicketsWithBalanceAfterInit()).to.be.revertedWith("Balance is zero")
        })
        it("Should revert when user is participating in current lottery", async function() {
            await hardhatLottery.buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await expect(hardhatLottery.buyTicketsWithBalance()).to.be.revertedWith("Your balance was already spent on a lottery")
        })
        it("Should revert when user is participating for the next week lottery", async function() {
            await hardhatLottery.connect(addr1).buyTickets(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await time.increase(time.duration.days(2));
            await hardhatLottery.initEarningStage()
            await hardhatLottery.buyTicketsAfterInit(ethAddress, 100,{value: ethers.utils.parseEther("1.0")});
            await expect(hardhatLottery.buyTicketsWithBalanceAfterInit()).to.be.revertedWith("Your balance was already spent on a lottery")
        })
    })
})
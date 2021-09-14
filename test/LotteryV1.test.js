const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
//requirements for test-helper openzeppelin plugin 
const { BN } = require("@openzeppelin/test-helpers/src/setup");
const balance = require('@openzeppelin/test-helpers/src/balance');
const time = require("@openzeppelin/test-helpers/src/time");
require('@openzeppelin/test-helpers/src/setup');

const provider = ethers.provider;

const erc20Abi = [
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "name": "balance",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

const hre = require("hardhat");
const { isCallTrace } = require('hardhat/internal/hardhat-network/stack-traces/message-trace');

const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const busdAddress = "0x4Fabb145d64652a948d72533023f6E7A623C7C53";
const usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const tusdAddress = "0x0000000000085d4780B73119b644AE5ecd22b376";
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const daiContract = new ethers.Contract(daiAddress, erc20Abi, provider);
const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, provider);
const busdContract = new ethers.Contract(busdAddress, erc20Abi, provider);
const usdtContract = new ethers.Contract(usdtAddress, erc20Abi, provider);
const tusdContract = new ethers.Contract(tusdAddress, erc20Abi, provider);



describe("LotteryV1 contract", async function(){
    
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
        tusdHolder =await ethers.getSigner("0x345D8e3A1F62eE6B1D483890976fD66168e390F2")

        Lottery = await ethers.getContractFactory("LotteryV1");
        [owner, recipient, addr1, ...addrs] = await ethers.getSigners();
        hardhatLottery = await upgrades.deployProxy(Lottery, [recipient.address]);
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
            await hardhatLottery.initFundingStage();

            await hardhatLottery.connect(buyerWithToken).buyTickets(daiAddress, 100);

            let purchase = await hardhatLottery.ticketOwners(1, 1)

            let balances = await hardhatLottery.balances(buyerWithToken.address)

            
            expect(balances.amount).to.equal(ethers.utils.parseUnits('1000.0', 18))
            expect(balances.lottery).to.equal(1)
            expect(purchase.firstTicket).to.equal(1)
            expect(purchase.lastTicket).to.equal(100)
            expect(purchase.buyer).to.equal(buyerWithToken.address)
        })
    })
})
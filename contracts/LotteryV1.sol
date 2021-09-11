// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseUpgradable.sol";
import "./interfaces/ICurveAddressProvider.sol";
import "./interfaces/ICurveExchange.sol";
import "./interfaces/ILendingPoolAddressesProvider.sol";
import "./interfaces/ILendingPool.sol";

contract LotteryV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, VRFConsumerBaseUpgradable{

    address public recipient;

    bytes32 internal keyHash;
    uint256 internal fee;
    
    uint256 public randomResult;

    uint public lotteryId;
    enum stages{Funding, Earning, Ended}
    stages stage;

    struct Details{
        uint firstTicket;
        uint lastTicket;
        address buyer;
    }

    struct lastBalance{
        uint amount;
        uint lottery;
    }

    mapping(uint => mapping(uint => Details)) public ticketOwners;
    uint public purchase;
    uint public purchaseAfterInit;
    uint public fundingTime;
    uint public earningTime;
    
    uint public totalTickets;
    uint public totalTicketsAfterInit;

    uint public totalFunds;
    uint public totalFundsAfterInit;
    
    mapping(address => lastBalance) public balances;

    mapping(address => bool) public acceptedCoins;

    ICurveAddressProvider provider;
    ILendingPoolAddressesProvider aavePoolProvider;

    IERC20Upgradeable daicontract;

    function initialize(address _recipient) public initializer {
        OwnableUpgradeable.__Ownable_init();
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
        VRFConsumerBaseUpgradable.initialize(
            0xf0d54349aDdcf704F77AE15b96510dEA15cb7952, // VRF Coordinator
            0x514910771AF9Ca656af840dff83E8264EcF986CA // LINK Token
        );

        recipient = _recipient;
        keyHash = 0xAA77729D3466CA35AE8D28B3BBAC7CC36A5031EFDC430821C02BC31A238AF445;
        fee = 2 * 10 ** 18;

        acceptedCoins[0x6B175474E89094C44Da98b954EedeAC495271d0F] = true; //DAI
        acceptedCoins[0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48] = true;//USDC
        acceptedCoins[0xdAC17F958D2ee523a2206206994597C13D831ec7] = true; //USDT
        acceptedCoins[0x0000000000085d4780B73119b644AE5ecd22b376] = true; //TUSD
        acceptedCoins[0x4Fabb145d64652a948d72533023f6E7A623C7C53] = true; //BUSD
        acceptedCoins[0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE] = true; //ETH 

        provider = ICurveAddressProvider(0x0000000022D53366457F9d5E68Ec105046FC4383);
        aavePoolProvider = ILendingPoolAddressesProvider(0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5);
        daicontract = IERC20Upgradeable(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    }

    //modifiers
    modifier fundingStage {
        require(stage == stages.Funding && block.timestamp <= fundingTime, "Funding stage is over");
        _;
    }

    modifier earningStage {
        require(stage == stages.Earning && block.timestamp <= earningTime);
        _;
    }

    modifier endedStage {
        require(stage == stages.Ended);
        _;
    }

    //functions
    function initFundingStage() external onlyOwner endedStage{
        stage = stages.Funding;
        lotteryId++;
        fundingTime = block.timestamp + 2 days;
        purchase = purchaseAfterInit;
        purchaseAfterInit = 0;
        totalTickets = totalTicketsAfterInit;
        totalTicketsAfterInit = 0;
        totalFunds = totalFundsAfterInit;
        totalFundsAfterInit = 0;
    }

    function initEarningStage() external onlyOwner {
        require(stage == stages.Funding && block.timestamp > fundingTime);
        stage = stages.Earning;
        earningTime = block.timestamp + 5 days;
        ILendingPool lendingPool = ILendingPool(aavePoolProvider.getLendingPool());
        daicontract.approve(address(lendingPool), totalFunds);
        lendingPool.deposit(0x6B175474E89094C44Da98b954EedeAC495271d0F, totalFunds, address(this), 0);
    }

    function getRandomNumber() external onlyOwner returns(bytes32 requestId) {
        require(stage == stages.Earning && block.timestamp > earningTime);
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK to pay fee");
        requestId = requestRandomness(keyHash, fee);
    }

    function chooseWinner() external onlyOwner {
        require(stage == stages.Earning && block.timestamp > earningTime);
        require(randomResult != 0, "Random number hasn't been retrieve yet");
        ILendingPool lendingPool = ILendingPool(aavePoolProvider.getLendingPool());
        uint256 totalRetrieve = lendingPool.withdraw(0x6B175474E89094C44Da98b954EedeAC495271d0F, type(uint).max, address(this));
        for (uint i = 1; i <= purchase; i++ ){
            if (randomResult >= ticketOwners[lotteryId][i].firstTicket && randomResult <= ticketOwners[lotteryId][i].lastTicket){
                address winner = ticketOwners[lotteryId][i].buyer;
                daicontract.transferFrom(address(this), winner, balances[winner].amount + ((totalRetrieve - totalFunds)*95/100));
                daicontract.transferFrom(address(this), recipient, ((totalRetrieve - totalFunds)*5/100));
                break;
            }
        }
        stage = stages.Ended;
        randomResult = 0;
    }

    function buyTickets(address _paymentToken, uint _amountTickets) external payable fundingStage {
        require(acceptedCoins[_paymentToken], "Not accepted type of token!");
        uint totalDeposit;
        if(_paymentToken == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE){
            require(msg.value > 0, "You have not sent any ETH");
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));

            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, msg.value,[address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0)]);
            totalDeposit = curveDex.exchange(pool, _paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, msg.value,(expected*99/100), address(this));

            //is 10^19 and not 10^18 because is 10$ for ticket, 
            require((totalDeposit / (10**19)) >= _amountTickets, "Not enough ETH sent to buy the tickets");

            //refunding excess amount of ETH to the sender in form of DAI
            daicontract.transferFrom(address(this), msg.sender, (totalDeposit - (_amountTickets*(10**19))));
            
        }else if(_paymentToken == 0x6B175474E89094C44Da98b954EedeAC495271d0F){
            require(daicontract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            daicontract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            totalDeposit = _amountTickets*(10**19);

        }else {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentToken);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            tokenContract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**19),[address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0)]);
            totalDeposit = curveDex.exchange(pool, _paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**19),(expected*99/100), address(this));

        }

        purchase++;
        ticketOwners[lotteryId][purchase].firstTicket = totalTickets + 1;
        ticketOwners[lotteryId][purchase].buyer = msg.sender;

        if(balances[msg.sender].amount == 0){
            balances[msg.sender].amount = totalDeposit;
            totalFunds += totalDeposit;
            balances[msg.sender].lottery = lotteryId;

            totalTickets += _amountTickets;
                 
        } else if (balances[msg.sender].amount > 0 && balances[msg.sender].lottery < lotteryId){
            balances[msg.sender].lottery = lotteryId;
            totalTickets += (balances[msg.sender].amount / (10**19)) + _amountTickets;
            balances[msg.sender].amount += totalDeposit;
            totalFunds += balances[msg.sender].amount;
        }else if (balances[msg.sender].amount > 0 && balances[msg.sender].lottery == lotteryId){
            balances[msg.sender].amount += totalDeposit;
            totalFunds += totalDeposit;
            totalTickets += _amountTickets; 
        }
        ticketOwners[lotteryId][purchase].lastTicket = totalTickets;
    }

    function buyTicketsWithBalance() external fundingStage{
        require(balances[msg.sender].amount > 0 && balances[msg.sender].lottery < lotteryId);
        purchase++;
        balances[msg.sender].lottery = lotteryId;
        ticketOwners[lotteryId][purchase].firstTicket = totalTickets + 1;
        ticketOwners[lotteryId][purchase].buyer = msg.sender;
        totalTickets += (balances[msg.sender].amount / (10**19));
        totalFunds += balances[msg.sender].amount;
        ticketOwners[lotteryId][purchase].lastTicket = totalTickets;
    }

    function buyTicketsAfterInit(address _paymentToken, uint _amountTickets) external payable earningStage{
        require(balances[msg.sender].amount == 0 || balances[msg.sender].amount > 0 && balances[msg.sender].lottery != lotteryId);
        require(acceptedCoins[_paymentToken], "Not accepted type of token!");
        uint totalDeposit;
        if(_paymentToken == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE){
            require(msg.value > 0, "You have not sent any ETH");
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));

            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, msg.value,[address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0)]);
            totalDeposit = curveDex.exchange(pool, _paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, msg.value,(expected*99/100), address(this));

            //is 10^19 and not 10^18 because is 10$ for ticket, 
            require((totalDeposit / (10**19)) >= _amountTickets, "Not enough ETH sent to buy the tickets");

            //refunding excess amount of ETH to the sender in form of DAI
            daicontract.transferFrom(address(this), msg.sender, (totalDeposit - (_amountTickets*(10**19))));
            
        }else if(_paymentToken == 0x6B175474E89094C44Da98b954EedeAC495271d0F){
            require(daicontract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            daicontract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            totalDeposit = _amountTickets*(10**19);

        }else {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentToken);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            tokenContract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**19),[address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0)]);
            totalDeposit = curveDex.exchange(pool, _paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**19),(expected*99/100), address(this));

        }

        purchaseAfterInit++;
        ticketOwners[lotteryId + 1][purchaseAfterInit].firstTicket = totalTicketsAfterInit + 1;
        ticketOwners[lotteryId + 1][purchaseAfterInit].buyer = msg.sender;

        if(balances[msg.sender].amount == 0){
            balances[msg.sender].amount = totalDeposit;
            totalFundsAfterInit += totalDeposit;
            balances[msg.sender].lottery = lotteryId + 1;

            totalTicketsAfterInit += _amountTickets;
                 
        } else if (balances[msg.sender].amount > 0 && balances[msg.sender].lottery < lotteryId){
            
            balances[msg.sender].lottery = lotteryId + 1;
            totalTicketsAfterInit += (balances[msg.sender].amount / (10**19)) + _amountTickets;
            balances[msg.sender].amount += totalDeposit;
            totalFundsAfterInit += balances[msg.sender].amount;

        }else if (balances[msg.sender].amount > 0 && balances[msg.sender].lottery > lotteryId){
            balances[msg.sender].amount += totalDeposit;

            totalTicketsAfterInit += _amountTickets; 
            totalFundsAfterInit += totalDeposit;
        }
        ticketOwners[lotteryId + 1][purchaseAfterInit].lastTicket = totalTicketsAfterInit;

    }
    
    function buyTicketsWithBalanceAfterInit() external earningStage{
        require(balances[msg.sender].amount > 0 && balances[msg.sender].lottery < lotteryId);
        purchaseAfterInit++;
        balances[msg.sender].lottery = lotteryId + 1;
        ticketOwners[lotteryId + 1][purchaseAfterInit].firstTicket = totalTicketsAfterInit + 1;
        ticketOwners[lotteryId + 1][purchaseAfterInit].buyer = msg.sender;
        totalTicketsAfterInit += (balances[msg.sender].amount / (10**19));
        totalFundsAfterInit += balances[msg.sender].amount;
        ticketOwners[lotteryId + 1][purchaseAfterInit].lastTicket = totalTicketsAfterInit;
    }



    function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
    randomResult = (randomness % totalTickets) + 1;
    }




}
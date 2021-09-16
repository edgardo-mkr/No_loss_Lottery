// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./randomNumber/VRFConsumerBase.sol";
import "./interfaces/ICurveAddressProvider.sol";
import "./interfaces/ICurveExchange.sol";
import "./interfaces/ILendingPoolAddressesProvider.sol";
import "./interfaces/ILendingPool.sol";
import "./interfaces/IUniswapV2Router.sol";

/// @title No Loss Lottery
/// @author Edgardo González
/** @notice this contract allows user to buy tickets (at a 10$ rate per ticket) with the most popular stablecoins(DAI, USDC, USDT, TUSD, BUSD) or ETH to gain to gain the total 
interes of the staked amount IN DAI, allowing withdrawal of the cost of the tickets at any moment after the end of the lottery (also in DAI)
*/ 
/// @dev

contract LotteryV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, VRFConsumerBase{
    
    ///@dev adding SafeERC20Upgradeable because of usdt not updated erc20 functions
    using SafeERC20Upgradeable for IERC20Upgradeable;


    address public recipient;

    bytes32 internal keyHash;
    uint256 internal fee;
    
    uint256 public randomResult;

    uint public lotteryId;
    ///@dev Funding is the first two days to buy tickets, Earning stage is when the funds are deposited to the pool and start producing intrerest, Ended the winner is chosen 
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
    ///@dev ticketOwners is used to keep track of the number of the lottery, number of purchases in a lottery and how many tickets were bought and by who
    ///@dev all variables with AfterInit are for keeping track of purchases during the 5 days period of staking the funds, to be added to the next week lottery
    mapping(uint => mapping(uint => Details)) public ticketOwners;
    uint public purchase;
    uint public purchaseAfterInit;

    ///@dev deadlines for buying tickets in current lottery (fundingTime) and deadline for staking the funds
    uint public fundingTime;
    uint public earningTime;
    
    uint public totalTickets;
    uint public totalTicketsAfterInit;

    uint public totalFunds;
    uint public totalFundsAfterInit;
    
    ///@dev balances of users and the last lottery they participated in  
    mapping(address => lastBalance) public balances;

    mapping(address => bool) public acceptedCoins;

    ICurveAddressProvider provider;
    ILendingPoolAddressesProvider aavePoolProvider;

    IERC20Upgradeable daicontract;

    function initialize(address _recipient, address _coordinator) public initializer {
        OwnableUpgradeable.__Ownable_init();
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
        VRFConsumerBase.init(
            _coordinator, // VRF Coordinator
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

        stage = stages.Ended;
    }

    //modifiers
    modifier fundingStage {
        require(stage == stages.Funding && block.timestamp <= fundingTime, "This is not Funding stage");
        _;
    }

    modifier earningStage {
        require(stage == stages.Earning && block.timestamp <= earningTime, "This is not Earning stage");
        _;
    }

    modifier endedStage {
        require(stage == stages.Ended, "Ended stage is over");
        _;
    }

    //functions

    function addStableCoin(address _stableCoin) external onlyOwner{
        acceptedCoins[_stableCoin] = true;
    }

    function deleteStablecoin(address _stableCoin) external onlyOwner{
        acceptedCoins[_stableCoin] = false;
    }

    ///@notice initiating a new lottery with a 2 days period to buy tickets
    ///@dev updating current variables with AfterInit ones 
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

    ///@notice initiating staking process(funds deposited to aDAI aave pool to generate interest) for 5 days
    function initEarningStage() external onlyOwner {
        require(stage == stages.Funding && block.timestamp > fundingTime, "This function can not be called at this moment");
        stage = stages.Earning;
        earningTime = block.timestamp + 5 days;
        ILendingPool lendingPool = ILendingPool(aavePoolProvider.getLendingPool());
        daicontract.approve(address(lendingPool), totalFunds);
        lendingPool.deposit(0x6B175474E89094C44Da98b954EedeAC495271d0F, totalFunds, address(this), 0);
    }

    ///@notice getting random number to choose the winner
    ///@dev using chainlink VRFconsumerBase oracle to obtain random number, important!! to have link tokens deposited in the contract to pay the fee
    function getRandomNumber() external onlyOwner returns(bytes32 requestId) {
        require(stage == stages.Earning && block.timestamp > earningTime, "This function can not be called at this moment");
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK to pay fee");
        requestId = requestRandomness(keyHash, fee);
    }

    ///@notice choosing the winner to pay the rewards and ending current lottery
    ///@dev the chainlink oracle does not give immediately a random number, the number is receive through the fallback function fulfillRandomness so we first checked that 
    /// randomResult has a different than 0 value
    function chooseWinner() external onlyOwner {
        require(stage == stages.Earning && block.timestamp > earningTime, "This function can not be called at this moment");
        require(randomResult != 0, "Random number hasn't been retrieve yet");
        ILendingPool lendingPool = ILendingPool(aavePoolProvider.getLendingPool());
        uint256 totalRetrieve = lendingPool.withdraw(0x6B175474E89094C44Da98b954EedeAC495271d0F, type(uint).max, address(this));
        for (uint i = 1; i <= purchase; i++ ){
            if (randomResult >= ticketOwners[lotteryId][i].firstTicket && randomResult <= ticketOwners[lotteryId][i].lastTicket){
                address winner = ticketOwners[lotteryId][i].buyer;
                uint amount = balances[winner].amount + ((totalRetrieve - totalFunds)*95/100);
                balances[winner].amount = 0;
                daicontract.transferFrom(address(this), winner, amount);
                daicontract.transferFrom(address(this), recipient, ((totalRetrieve - totalFunds)*5/100));
                break;
            }
        }
        stage = stages.Ended;
        randomResult = 0;
    }

    ///@notice to buy tickets during the 2 days period (1 ticket = 10$ = 10 stableCoins)
    ///@param _paymentToken token which the user choose to pay with 
    ///@param _amountTickets number of tickets to buy
    ///@dev when paying with a coin different than DAI the contract handles the swap using curve protocol 
    ///@dev the user must first approve this contract to spends his tokens, in the case of using ETH thats not necessary but must put 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    ///as paymentToken. the contract also refunds the user of any excess DAI tokens after the swap when using ETH 
    function buyTickets(address _paymentToken, uint _amountTickets) external payable fundingStage nonReentrant{
        require(acceptedCoins[_paymentToken], "Not accepted type of token!");
        uint totalDeposit;
        if(_paymentToken == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE){
            require(msg.value > 0, "You have not sent any ETH");
            IUniswapV2Router uniSwap = IUniswapV2Router(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
            uint[] memory expectedAmount = new uint[](2);
            address[] memory path = new address[](2);
            path[0] = uniSwap.WETH();
            path[1] = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
            expectedAmount = uniSwap.getAmountsOut(msg.value,path);
            expectedAmount = uniSwap.swapExactETHForTokens{value: msg.value}(expectedAmount[1],path,address(this),block.timestamp + 1);
             
            require((expectedAmount[1] / (10**19)) >= _amountTickets, "Not enough ETH sent to buy the tickets");

            totalDeposit = _amountTickets*(10**19);
            
            daicontract.transferFrom(address(this), msg.sender, (expectedAmount[1] - (_amountTickets*(10**19))));
            
        }else if(_paymentToken == 0x6B175474E89094C44Da98b954EedeAC495271d0F){
            require(daicontract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            daicontract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            totalDeposit = _amountTickets*(10**19);

        }else if(_paymentToken == 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 || _paymentToken == 0xdAC17F958D2ee523a2206206994597C13D831ec7) {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentToken);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**7), "Not enough token approve to buy tickets");
            tokenContract.safeTransferFrom(msg.sender, address(this), _amountTickets*(10**7));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**7));
            tokenContract.safeIncreaseAllowance(address(curveDex), _amountTickets*(10**7));
            totalDeposit = curveDex.exchange(pool, _paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**7),(expected*99/100), address(this));
            
            
        }else {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentToken);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            tokenContract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**19));
            tokenContract.approve(address(curveDex), _amountTickets*(10**19));
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

    ///@dev function used only when an user has a balance acredited from a previous lottery and wants to use it to buy new tickets
    function buyTicketsWithBalance() external fundingStage{
        require(balances[msg.sender].amount > 0, "Balance is zero");
        require(balances[msg.sender].lottery < lotteryId, "Your balance was already spent on a lottery");
        purchase++;
        balances[msg.sender].lottery = lotteryId;
        ticketOwners[lotteryId][purchase].firstTicket = totalTickets + 1;
        ticketOwners[lotteryId][purchase].buyer = msg.sender;
        totalTickets += (balances[msg.sender].amount / (10**19));
        totalFunds += balances[msg.sender].amount;
        ticketOwners[lotteryId][purchase].lastTicket = totalTickets;
    }

    ///@param _paymentToken token which the user choose to pay with 
    ///@param _amountTickets number of tickets to buy 
    ///@dev function to buy tickets after the 2 days pariod have passed, this purchase is stored for the next week lottery
    function buyTicketsAfterInit(address _paymentToken, uint _amountTickets) external payable earningStage nonReentrant{
        require(balances[msg.sender].amount == 0 || (balances[msg.sender].amount > 0 && balances[msg.sender].lottery != lotteryId), "You're already participating in the current lottery");
        require(acceptedCoins[_paymentToken], "Not accepted type of token!");
        uint totalDeposit;
        if(_paymentToken == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE){
            require(msg.value > 0, "You have not sent any ETH");
            IUniswapV2Router uniSwap = IUniswapV2Router(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
            uint[] memory expectedAmount = new uint[](2);
            address[] memory path = new address[](2);
            path[0] = uniSwap.WETH();
            path[1] = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
            expectedAmount = uniSwap.getAmountsOut(msg.value,path);
            expectedAmount = uniSwap.swapExactETHForTokens{value: msg.value}(expectedAmount[1],path,address(this),block.timestamp + 1);
             
            require((expectedAmount[1] / (10**19)) >= _amountTickets, "Not enough ETH sent to buy the tickets");

            totalDeposit = _amountTickets*(10**19);
            
            daicontract.transferFrom(address(this), msg.sender, (expectedAmount[1] - (_amountTickets*(10**19))));
            
        }else if(_paymentToken == 0x6B175474E89094C44Da98b954EedeAC495271d0F){
            require(daicontract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            daicontract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            totalDeposit = _amountTickets*(10**19);

        }else if(_paymentToken == 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 || _paymentToken == 0xdAC17F958D2ee523a2206206994597C13D831ec7) {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentToken);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**7), "Not enough token approve to buy tickets");
            tokenContract.safeTransferFrom(msg.sender, address(this), _amountTickets*(10**7));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**7));
            tokenContract.safeIncreaseAllowance(address(curveDex), _amountTickets*(10**7));
            totalDeposit = curveDex.exchange(pool, _paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**7),(expected*99/100), address(this));
            
            
        }else {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentToken);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            tokenContract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, 0x6B175474E89094C44Da98b954EedeAC495271d0F, _amountTickets*(10**19));
            tokenContract.approve(address(curveDex), _amountTickets*(10**19));
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
    
    ///@dev same as buyTicketsWithBalance but for the earningStage
    function buyTicketsWithBalanceAfterInit() external earningStage{
        require(balances[msg.sender].amount > 0, "Balance is zero");
        require(balances[msg.sender].lottery < lotteryId, "Your balance was already spent on a lottery");
        purchaseAfterInit++;
        balances[msg.sender].lottery = lotteryId + 1;
        ticketOwners[lotteryId + 1][purchaseAfterInit].firstTicket = totalTicketsAfterInit + 1;
        ticketOwners[lotteryId + 1][purchaseAfterInit].buyer = msg.sender;
        totalTicketsAfterInit += (balances[msg.sender].amount / (10**19));
        totalFundsAfterInit += balances[msg.sender].amount;
        ticketOwners[lotteryId + 1][purchaseAfterInit].lastTicket = totalTicketsAfterInit;
    }

    
    function withdrawal() external payable nonReentrant{
        require(balances[msg.sender].amount > 0, "Balance is 0!");
        require(balances[msg.sender].lottery < lotteryId, "you can't withdraw while participating in a lottery");

        uint amount = balances[msg.sender].amount;
        balances[msg.sender].amount = 0;
        daicontract.transferFrom(address(this), msg.sender, amount);
    }

    ///@param requestId ID of the random number request, not use in this contract
    ///@param randomness random number
    ///@dev fallback function that receives the random number from the chainlink oracle 
    ///@dev saving a number between 1 and totalTickets
    function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
        randomResult = (randomness % totalTickets) + 1;
    }




}
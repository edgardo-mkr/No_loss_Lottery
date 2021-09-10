// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./interfaces/ICurveAddressProvider.sol";
import "./interfaces/ICurveExchange.sol";

contract LotteryV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {

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

    
    uint totalTickets;
    
    mapping(address => lastBalance) public balances;

    mapping(address => bool) public acceptedCoins;

    ICurveAddressProvider provider;

    address constant daiAddress;
    IERC20Upgradeable daicontract;

    function initialize(address _recipient) public initializer {
        OwnableUpgradeable.__Ownable_init();
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

        acceptedCoins[0x6B175474E89094C44Da98b954EedeAC495271d0F] = true //DAI
        acceptedCoins[0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48] = true //USDC
        acceptedCoins[0xdAC17F958D2ee523a2206206994597C13D831ec7] = true //USDT
        acceptedCoins[0x0000000000085d4780B73119b644AE5ecd22b376] = true //TUSD
        acceptedCoins[0x4Fabb145d64652a948d72533023f6E7A623C7C53] = true //BUSD
        acceptedCoins[0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE] = true //ETH 

        provider = ICurveAddressProvider(0x0000000022D53366457F9d5E68Ec105046FC4383);
        daiAddress = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
        daicontract = IERC20Upgradeable(daiAddress);
    }

    function initFundingStage() external onlyOwner{
        stage = stages.Funding;
        lotteryId++;
        purchase = 0;
    }


    function buyTickets(address _paymentToken, uint _amountTickets) external payable {
        require(acceptedCoins[_paymentToken], "Not accepted type of token!");
        uint totalDeposit;
        if(_paymentToken == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE){
            require(msg.value > 0, "You have not sent any ETH");
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));

            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, daiAddress, msg.value,[address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0)]);
            totalDeposit = curveDex.exchange(pool, _paymentToken, daiAddress, msg.value,(expected*99/100), address(this));

            //is 10^19 and not 10^18 because is 10$ for ticket, 
            require((totalDeposit / (10**19)) >= _amountTickets, "Not enough ETH sent to buy the tickets");

            //refunding excess amount of ETH to the sender in form of DAI
            daicontract.transferFrom(address(this), msg.sender, (totalDeposit - (_amountTickets*(10**19))));
            
        }else if(_paymentMethod == daiAddress){
            require(daicontract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            daicontract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            totalDeposit = _amountTickets*(10**19);

        }else {
            IERC20Upgradeable tokenContract = IERC20Upgradeable(_paymentMethod);
            require(tokenContract.allowance(msg.sender, address(this)) >= _amountTickets*(10**19), "Not enough token approve to buy tickets");
            tokenContract.transferFrom(msg.sender, address(this), _amountTickets*(10**19));
            ICurveExchange curveDex = ICurveExchange(provider.get_address(2));
            (address pool, uint256 expected) = curveDex.get_best_rate(_paymentToken, daiAddress, _amountTickets*(10**19),[address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0)]);
            totalDeposit = curveDex.exchange(pool, _paymentToken, daiAddress, _amountTickets*(10**19),(expected*99/100), address(this));

        }
        
        if(balances[msg.sender].amount == 0){
                balances[msg.sender].amount = totalDeposit;
                balances[msg.sender].lottery = lotteryId;
                purchase++;
                ticketOwners[lotteryId][purchase].firstTicket = totalTickets + 1;
                totalTickets += _amountTickets;
                ticketOwners[lotteryId][purchase].lastTicket = totalTickets
                ticketOwners[lotteryId][purchase].buyer = msg.sender;
                 
            } else if (balances[msg.sender].amount > 0 && balances[msg.sender].lottery < lotteryId){
                purchase++;
                ticketOwners[lotteryId][purchase].firstTicket = totalTickets + 1;
                totalTickets += (balances[msg.sender].amount / (10**19)) + _amountTickets; 
                ticketOwners[lotteryId][purchase].lastTicket = totalTickets;
                ticketOwners[lotteryId][purchase].buyer = msg.sender;
                
                balances[msg.sender].amount += totalDeposit;
                balances[msg.sender].lottery = lotteryId;

            }else if (balances[msg.sender].amount > 0 && balances[msg.sender].lottery == lotteryId){
                balances[msg.sender].amount += totalDeposit;
                purchase++;
                ticketOwners[lotteryId][purchase].firstTicket = totalTickets + 1;
                totalTickets += _amountTickets; 
                ticketOwners[lotteryId][purchase].lastTicket = totalTickets;
                ticketOwners[lotteryId][purchase].buyer = msg.sender;
            }
    }

}
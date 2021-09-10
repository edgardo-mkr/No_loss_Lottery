pragma solidity ^0.8.0;

interface ICurveExchange {
    function get_best_rate(address _from, address _to, uint256 _amount, address[8] _exclude_pools) external view returns(address,uint256);

    function exchange(address _pool, address _from, address _to, uint256 _amount, uint256 _expected, address _receiver) external payable returns(uint256); 
}
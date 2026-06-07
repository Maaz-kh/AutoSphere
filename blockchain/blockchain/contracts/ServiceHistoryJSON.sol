// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 ServiceHistoryJSON
 Stores full service report as a JSON string on-chain.
 WARNING: This is intended for local Ganache/testing only.
*/

contract ServiceHistoryJSON {
    struct ServiceRecord {
        string vehicleId;
        string jsonData;   // full service JSON string
        uint256 timestamp;
    }

    uint256 public recordCount;
    mapping(uint256 => ServiceRecord) public records;
    mapping(string => uint256[]) private vehicleRecords;

    event ServiceStored(uint256 indexed recordId, string vehicleId, uint256 timestamp);

    // add full JSON (as string) - public, backend enforces auth
    function addServiceRecord(string memory vehicleId, string memory jsonData) public returns (uint256) {
        recordCount++;
        records[recordCount] = ServiceRecord({
            vehicleId: vehicleId,
            jsonData: jsonData,
            timestamp: block.timestamp
        });
        vehicleRecords[vehicleId].push(recordCount);
        emit ServiceStored(recordCount, vehicleId, block.timestamp);
        return recordCount;
    }

    // get record IDs for a vehicle
    function getRecordsByVehicle(string memory vehicleId) public view returns (uint256[] memory) {
        return vehicleRecords[vehicleId];
    }

    // get single record by id
    function getRecordById(uint256 id) public view returns (string memory vehicleId, string memory jsonData, uint256 timestamp) {
        ServiceRecord storage r = records[id];
        return (r.vehicleId, r.jsonData, r.timestamp);
    }
}

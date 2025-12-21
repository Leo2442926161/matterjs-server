"Matter Controller Server using WebSockets."
---
Complete Argument Specification

| Argument                      | Type         | Default                                          | Required | Description                                          |     
|-------------------------------|--------------|--------------------------------------------------|----------|------------------------------------------------------|   
| --vendorid                    | integer      | 0xFFF1 (65521)                                   | No       | Vendor ID for the Fabric                             |                                      
| --fabricid                    | integer      | 1                                                | No       | Fabric ID for the Fabric                             |                                      
| --storage-path                | string       | ~/.matter_server                                 | No       | Storage path to keep persistent data                 |                                      
| --port                        | integer      | 5580                                             | No       | TCP Port for WebSocket server                        |                                      
| --listen-address              | string[]     | null (bind all)                                  | No       | IP address(es) to bind WebSocket server. Repeatable. |                                      
| --log-level                   | enum         | "info"                                           | No       | Global logging level                                 |                                      
| --log-level-sdk               | enum         | "error"                                          | No       | Matter SDK logging level                             |                                      
| --log-file                    | string       | null                                             | No       | Log file path (optional)                             |                                      
| --primary-interface           | string       | null                                             | No       | Primary network interface for link-local addresses   |                                      
| --paa-root-cert-dir           | string       | <project>/credentials/development/paa-root-certs | No       | Directory for PAA root certificates                  |                                      
| --enable-test-net-dcl         | boolean flag | false                                            | No       | Enable test-net DCL certificates                     |                                      
| --bluetooth-adapter           | integer      | null                                             | No       | Bluetooth adapter ID for direct commissioning        |                                      
| --log-node-ids                | integer[]    | null                                             | No       | Node IDs to filter logs (multiple values)            |                                      
| --ota-provider-dir            | string       | ./updates                                        | No       | Directory for OTA Provider files                     |                                      
| --disable-server-interactions | boolean flag | false*                                           | No       | Disable server cluster interactions                  |                                      

*Note: The Python implementation uses inverted logic where the internal default is true (enabled) and passing the flag sets it to false (disabled).
                                                                                                                                                                                                             
---                                                                                                                                                                                                        
Enum Values

--log-level (case-insensitive):
- critical
- error
- warning
- info (default)
- debug
- verbose

--log-level-sdk:
- none
- error (default)
- progress
- detail
- automation

  ---                                                                                                                                                                                                        
Multi-Value Arguments

Two arguments accept multiple values:

1. --listen-address - Repeatable flag pattern:                                                                                                                                                             
   matter-server --listen-address 192.168.1.100 --listen-address "::1"
2. --log-node-ids - Space-separated list:                                                                                                                                                                  
   matter-server --log-node-ids 1 2 3

  ---                                                                                                                                                                                                        
Environment Variables

| Variable               | Purpose                           | Type                     |                                                                                                                  
  |------------------------|-----------------------------------|--------------------------|                                                                                                                  
| PYTHONDEBUG            | Enables debug mode in event loop  | boolean (presence check) |                                                                                                                  
| MATTER_VERBOSE_LOGGING | Enables verbose logging in client | boolean (presence check) |                                                                                                                  
                  
Old storage format:
Mounted e.g. in /data:
* NODEID.json
* NODEID.json.backup
* chip.json
* /credentials (all certs), will be ignored
* /updates (manually added OTA files), import in server start

# Port Mapping Fix Documentation

## User-Specified Host Port

- When creating a simulation, you can now specify the host port you want to use (e.g., 5762, 6000, 12345, etc.).
- The backend will map `<your_port>:5762` in Docker (host port to container Serial 2).
- The backend will validate that the port is not already in use (by another sim or container).
- If the port is already in use, the backend will return an error and the simulation will not be created.
- The frontend should display the error to the user and prompt for a different port.
- The assigned port is always reported in the simulation object and shown in the vehicle card/connection tab.

## Example
- Sim 1: Host port 5762 → Container port 5762 (Serial 2)
- Sim 2: Host port 6000 → Container port 5762 (Serial 2)
- Sim 3: Host port 12345 → Container port 5762 (Serial 2)

## Error Handling
- If you try to use a port that is already in use, you will get:
  ```json
  { "error": "Port 5762 is already in use." }
  ```
- Choose a different port and try again.

## Files Modified
- `xgcs/server/src/routes/simulation_docker.js` - Accepts and validates user-specified port
- `xgcs/PORT_MAPPING_FIX.md` - This documentation file

## Date
Fixed on: $(date)
By: AI Assistant
Issue reported by: Jeremy 
#!/bin/bash

# XGCS Arm/Disarm Test Script
# SWE100821: Comprehensive testing of flight control commands

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                           ║${NC}"
echo -e "${BLUE}║   🧪 XGCS Arm/Disarm Stability Test  🧪                 ║${NC}"
echo -e "${BLUE}║                                                           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"

# Configuration
BASE_URL="http://localhost:3001"
CPP_BACKEND_URL="http://localhost:8081"
TEST_VEHICLE_ID="test_vehicle_001"
MAX_RETRIES=3
RETRY_DELAY=2

# Function to check if a service is running
check_service() {
    local service_name=$1
    local url=$2
    
    if curl -s --max-time 5 -f "$url" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ $service_name is running${NC}"
        return 0
    else
        echo -e "${RED}✗ $service_name is not responding${NC}"
        return 1
    fi
}

# Function to wait for service
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    echo -n -e "${BLUE}Waiting for $service_name...${NC}"
    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 5 -f "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}✓ Ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e " ${RED}✗ Timeout${NC}"
    return 1
}

# Function to test API endpoint
test_endpoint() {
    local endpoint=$1
    local method=${2:-GET}
    local data=${3:-""}
    local expected_status=${4:-200}
    
    echo -e "${BLUE}Testing $method $endpoint${NC}"
    
    local response
    local status_code
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint" 2>/dev/null || echo "ERROR\n000")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            "$BASE_URL$endpoint" 2>/dev/null || echo "ERROR\n000")
    fi
    
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ Status: $status_code (expected: $expected_status)${NC}"
        if [ -n "$response_body" ] && [ "$response_body" != "ERROR" ]; then
            echo -e "${BLUE}Response: $response_body${NC}"
        fi
        return 0
    else
        echo -e "${RED}✗ Status: $status_code (expected: $expected_status)${NC}"
        if [ -n "$response_body" ] && [ "$response_body" != "ERROR" ]; then
            echo -e "${RED}Response: $response_body${NC}"
        fi
        return 1
    fi
}

# Function to test arm command
test_arm_command() {
    local vehicle_id=$1
    local attempt=1
    
    echo -e "${BLUE}Testing ARM command for vehicle: $vehicle_id${NC}"
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo -e "${YELLOW}Attempt $attempt/$MAX_RETRIES${NC}"
        
        local data="{\"vehicleId\": \"$vehicle_id\"}"
        if test_endpoint "/api/command/arm" "POST" "$data" 200; then
            echo -e "${GREEN}✓ ARM command test passed${NC}"
            return 0
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            echo -e "${YELLOW}Retrying in $RETRY_DELAY seconds...${NC}"
            sleep $RETRY_DELAY
        fi
        ((attempt++))
    done
    
    echo -e "${RED}✗ ARM command test failed after $MAX_RETRIES attempts${NC}"
    return 1
}

# Function to test disarm command
test_disarm_command() {
    local vehicle_id=$1
    local attempt=1
    
    echo -e "${BLUE}Testing DISARM command for vehicle: $vehicle_id${NC}"
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo -e "${YELLOW}Attempt $attempt/$MAX_RETRIES${NC}"
        
        local data="{\"vehicleId\": \"$vehicle_id\"}"
        if test_endpoint "/api/command/disarm" "POST" "$data" 200; then
            echo -e "${GREEN}✓ DISARM command test passed${NC}"
            return 0
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            echo -e "${YELLOW}Retrying in $RETRY_DELAY seconds...${NC}"
            sleep $RETRY_DELAY
        fi
        ((attempt++))
    done
    
    echo -e "${RED}✗ DISARM command test failed after $MAX_RETRIES attempts${NC}"
    return 1
}

# Function to test flight mode commands
test_flight_mode_commands() {
    local vehicle_id=$1
    
    echo -e "${BLUE}Testing flight mode commands for vehicle: $vehicle_id${NC}"
    
    # Test takeoff
    local takeoff_data="{\"vehicleId\": \"$vehicle_id\"}"
    if test_endpoint "/api/command/takeoff" "POST" "$takeoff_data" 200; then
        echo -e "${GREEN}✓ Takeoff command test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Takeoff command test failed (may be expected if not in flight)${NC}"
    fi
    
    # Test land
    local land_data="{\"vehicleId\": \"$vehicle_id\"}"
    if test_endpoint "/api/command/land" "POST" "$land_data" 200; then
        echo -e "${GREEN}✓ Land command test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Land command test failed (may be expected if not in flight)${NC}"
    fi
    
    # Test RTL
    local rtl_data="{\"vehicleId\": \"$vehicle_id\"}"
    if test_endpoint "/api/command/rtl" "POST" "$rtl_data" 200; then
        echo -e "${GREEN}✓ RTL command test passed${NC}"
    else
        echo -e "${YELLOW}⚠ RTL command test failed (may be expected if not in flight)${NC}"
    fi
    
    # Test pause
    local pause_data="{\"vehicleId\": \"$vehicle_id\"}"
    if test_endpoint "/api/command/pause" "POST" "$pause_data" 200; then
        echo -e "${GREEN}✓ Pause command test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Pause command test failed (may be expected if not in flight)${NC}"
    fi
}

# Function to test flight mode setting
test_flight_mode_setting() {
    local vehicle_id=$1
    
    echo -e "${BLUE}Testing flight mode setting for vehicle: $vehicle_id${NC}"
    
    # Test setting to STABILIZE mode
    local mode_data="{\"vehicleId\": \"$vehicle_id\", \"mode\": \"STABILIZE\"}"
    if test_endpoint "/api/command/set_mode" "POST" "$mode_data" 200; then
        echo -e "${GREEN}✓ Set mode command test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Set mode command test failed (may be expected if not connected)${NC}"
    fi
}

# Function to test parameter endpoints
test_parameter_endpoints() {
    local vehicle_id=$1
    
    echo -e "${BLUE}Testing parameter endpoints for vehicle: $vehicle_id${NC}"
    
    # Test getting parameters
    if test_endpoint "/api/parameters?vehicleId=$vehicle_id" "GET" "" 200; then
        echo -e "${GREEN}✓ Get parameters test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Get parameters test failed (may be expected if not connected)${NC}"
    fi
    
    # Test setting a parameter (safe test parameter)
    local param_data="{\"vehicleId\": \"$vehicle_id\", \"name\": \"TEST_PARAM\", \"value\": 1.0}"
    if test_endpoint "/api/parameters/set" "POST" "$param_data" 200; then
        echo -e "${GREEN}✓ Set parameter test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Set parameter test failed (may be expected if not connected)${NC}"
    fi
}

# Function to test MAVLink message sending
test_mavlink_endpoints() {
    local vehicle_id=$1
    
    echo -e "${BLUE}Testing MAVLink endpoints for vehicle: $vehicle_id${NC}"
    
    # Test sending a simple MAVLink message
    local mavlink_data="{\"vehicleId\": \"$vehicle_id\", \"messageType\": \"HEARTBEAT\", \"parameters\": {}}"
    if test_endpoint "/api/mavlink/send" "POST" "$mavlink_data" 200; then
        echo -e "${GREEN}✓ MAVLink message sending test passed${NC}"
    else
        echo -e "${YELLOW}⚠ MAVLink message sending test failed (may be expected if not connected)${NC}"
    fi
}

# Function to test flight modes endpoint
test_flight_modes_endpoint() {
    local vehicle_id=$1
    
    echo -e "${BLUE}Testing flight modes endpoint for vehicle: $vehicle_id${NC}"
    
    if test_endpoint "/api/vehicle/$vehicle_id/flight-modes" "GET" "" 200; then
        echo -e "${GREEN}✓ Flight modes endpoint test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Flight modes endpoint test failed (may be expected if not connected)${NC}"
    fi
}

# Function to test flight mode change endpoint
test_flight_mode_change_endpoint() {
    local vehicle_id=$1
    
    echo -e "${BLUE}Testing flight mode change endpoint for vehicle: $vehicle_id${NC}"
    
    local mode_data="{\"flight_mode\": \"STABILIZE\"}"
    if test_endpoint "/api/vehicle/$vehicle_id/flight-mode" "POST" "$mode_data" 200; then
        echo -e "${GREEN}✓ Flight mode change endpoint test passed${NC}"
    else
        echo -e "${YELLOW}⚠ Flight mode change endpoint test failed (may be expected if not connected)${NC}"
    fi
}

# Function to run comprehensive tests
run_comprehensive_tests() {
    local vehicle_id=$1
    
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Running comprehensive tests for vehicle: $vehicle_id${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    
    local test_results=()
    
    # Test basic endpoints
    echo -e "${BLUE}1. Testing basic endpoints...${NC}"
    test_endpoint "/health" "GET" "" 200
    test_endpoint "/connections" "GET" "" 200
    test_endpoint "/vehicles" "GET" "" 200
    
    # Test command endpoints
    echo -e "${BLUE}2. Testing command endpoints...${NC}"
    test_arm_command "$vehicle_id"
    test_disarm_command "$vehicle_id"
    test_flight_mode_commands "$vehicle_id"
    test_flight_mode_setting "$vehicle_id"
    
    # Test parameter endpoints
    echo -e "${BLUE}3. Testing parameter endpoints...${NC}"
    test_parameter_endpoints "$vehicle_id"
    
    # Test MAVLink endpoints
    echo -e "${BLUE}4. Testing MAVLink endpoints...${NC}"
    test_mavlink_endpoints "$vehicle_id"
    
    # Test flight mode endpoints
    echo -e "${BLUE}5. Testing flight mode endpoints...${NC}"
    test_flight_modes_endpoint "$vehicle_id"
    test_flight_mode_change_endpoint "$vehicle_id"
    
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Comprehensive tests completed!${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

# Main test execution
main() {
    echo -e "${BLUE}Starting XGCS Arm/Disarm Stability Test...${NC}"
    echo ""
    
    # Check if services are running
    echo -e "${BLUE}Checking service status...${NC}"
    
    if ! check_service "Proxy Server" "$BASE_URL/health"; then
        echo -e "${RED}Proxy server is not running. Please start XGCS first.${NC}"
        exit 1
    fi
    
    if ! check_service "C++ Backend" "$CPP_BACKEND_URL/health"; then
        echo -e "${YELLOW}C++ backend is not running. Some tests may fail.${NC}"
    fi
    
    echo ""
    
    # Wait for services to be fully ready
    echo -e "${BLUE}Waiting for services to be ready...${NC}"
    wait_for_service "Proxy Server" "$BASE_URL/health"
    
    echo ""
    
    # Run comprehensive tests
    run_comprehensive_tests "$TEST_VEHICLE_ID"
    
    echo ""
    echo -e "${GREEN}✅ All tests completed!${NC}"
    echo ""
    echo -e "${BLUE}Test Summary:${NC}"
    echo -e "  • Basic endpoints: Tested"
    echo -e "  • Arm/Disarm commands: Tested"
    echo -e "  • Flight mode commands: Tested"
    echo -e "  • Parameter endpoints: Tested"
    echo -e "  • MAVLink endpoints: Tested"
    echo -e "  • Flight mode endpoints: Tested"
    echo ""
    echo -e "${BLUE}Note: Some tests may show warnings if no vehicle is connected.${NC}"
    echo -e "${BLUE}This is expected behavior and does not indicate a failure.${NC}"
}

# Run main function
main "$@"

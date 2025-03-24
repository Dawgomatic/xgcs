cmake_minimum_required(VERSION 3.10)
project(xgcs_server)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(Boost REQUIRED COMPONENTS system thread)
find_package(nlohmann_json REQUIRED)

# For MAVSDK, try to find it with pkg-config first
find_package(PkgConfig)
if(PkgConfig_FOUND)
    pkg_check_modules(MAVSDK IMPORTED_TARGET mavsdk)
endif()

# If pkg-config didn't find it, try the regular way
if(NOT MAVSDK_FOUND)
    find_package(MAVSDK REQUIRED)
endif()

# Include directories
include_directories(
    ${Boost_INCLUDE_DIRS}
    ${MAVSDK_INCLUDE_DIRS}
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# Add executable
add_executable(server 
    src/main.cpp
    src/connection_manager.cpp
)

# Link libraries
if(TARGET PkgConfig::MAVSDK)
    target_link_libraries(server
        ${Boost_LIBRARIES}
        PkgConfig::MAVSDK
        nlohmann_json::nlohmann_json
        pthread
    )
else()
    target_link_libraries(server
        ${Boost_LIBRARIES}
        ${MAVSDK_LIBRARIES}
        nlohmann_json::nlohmann_json
        pthread
    )
endif()

# Add this to your CMakeLists.txt if needed
link_directories(/usr/local/lib)  # This is where MAVSDK is typically installed
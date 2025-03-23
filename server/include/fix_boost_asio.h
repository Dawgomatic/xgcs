#pragma once

// This header must be included before any other includes in main.cpp

// Disable thread handler type requirements
#define BOOST_ASIO_DISABLE_HANDLER_TYPE_REQUIREMENTS 1

// Disable thread invocation errors
#define BOOST_ASIO_ENABLE_HANDLER_TRACKING 0

// Enable move support
#define BOOST_ASIO_HAS_MOVE 1

// Disable deprecated auto_ptr warnings
#define _SILENCE_CXX17_ADAPTOR_TYPEDEFS_DEPRECATION_WARNING 1

// Use global placeholders
#define BOOST_BIND_GLOBAL_PLACEHOLDERS 1

// Disable strict aliasing
#define BOOST_ASIO_DISABLE_STRICT_ALIASING 1

// Enable noexcept
#define BOOST_ASIO_NO_EXCEPTIONS 0

// Disable deprecated functionality
#define BOOST_ASIO_NO_DEPRECATED 1

// Allow socket operations to be moved
#define BOOST_ASIO_SOCKET_IOSTREAM_ENABLE_MOVE 1

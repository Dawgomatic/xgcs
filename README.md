# xgcs

## Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- CMake (v3.10 or higher)
- C++ compiler with C++17 support
- Crow HTTP library
- nlohmann-json library

## Installation

### Frontend (Client)

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies using Yarn:
```bash
yarn install
```

### Backend (Server)

1. Create a build directory and navigate into it:
```bash
cd server
mkdir build
cd build
```

2. Generate build files with CMake:
```bash
cmake ..
```

3. Build the project:
```bash
cmake --build .
```

## Running the Application

### Frontend
Start the development server:
```bash
cd client
yarn start
```
The application will be available at `http://localhost:3000`

### Backend
Run the server:
```bash
cd server/build
./server
```
The backend API will be available at `http://localhost:3001`

## Development

- Frontend is built with React and uses modern JavaScript features
- Backend is implemented in C++ using the Crow framework
- API communication is handled through HTTP endpoints

## Project Structure

```
.
├── client/                 # React frontend
│   ├── public/            # Static files
│   ├── src/              # Source files
│   └── package.json      # Frontend dependencies
│
└── server/               # C++ backend
    ├── src/             # Source files
    ├── include/         # Header files
    └── CMakeLists.txt   # CMake build configuration
```
FROM ubuntu:22.04

# Install all required dependencies manually
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git python3 python3-pip python3-dev python3-setuptools \
    build-essential ccache g++ gawk make wget \
    pkg-config libtool libxml2-dev libxslt1-dev \
    libncurses5-dev libncursesw5-dev \
    libreadline-dev libffi-dev \
    libssl-dev libbz2-dev libsqlite3-dev \
    libusb-1.0-0-dev libudev-dev \
    screen tmux \
    python3-numpy python3-pyparsing python3-psutil \
    xterm xfonts-base python3-matplotlib python3-serial python3-scipy python3-opencv \
    libcsfml-dev libcsfml-audio2.5 libcsfml-graphics2.5 libcsfml-network2.5 libcsfml-system2.5 libcsfml-window2.5 \
    libsfml-audio2.5 libsfml-dev libsfml-graphics2.5 libsfml-network2.5 libsfml-system2.5 libsfml-window2.5 \
    python3-yaml \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -ms /bin/bash ardupilot

# Clone ArduPilot
RUN git clone --recurse-submodules https://github.com/ArduPilot/ardupilot.git /ardupilot

# Fix permissions so non-root user can build
RUN chown -R ardupilot:ardupilot /ardupilot

WORKDIR /ardupilot

# Switch to non-root user
USER ardupilot

# Install Python dependencies
RUN pip3 install future lxml pymavlink pyserial MAVProxy geocoder empy==3.3.4 ptyprocess dronecan flake8 junitparser wsproto tabulate pygame intelhex pexpect

# Configure and build ArduPilot
RUN ./waf configure --board sitl && \
    ./waf copter && \
    ./waf plane && \
    ./waf rover && \
    ./waf sub && \
    ./waf blimp 
    
# Expose default SITL port
EXPOSE 5760
EXPOSE 5761
EXPOSE 5762

# Entrypoint: run arducopter SITL
ENTRYPOINT ["./build/sitl/bin/arducopter", "--model", "quad", "--home", "37.7749,-122.4194,0,0", "--speedup", "1", "--defaults", "/ardupilot/Tools/autotest/default_params/copter.parm", "-I0"]

# Set the default command to run SITL
CMD ["/bin/bash"]
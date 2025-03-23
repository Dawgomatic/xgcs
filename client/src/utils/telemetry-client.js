class TelemetryClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.connected = false;
    this.listeners = {
      position: [],
      velocity: [],
      attitude: [],
      connection: []
    };
    this.pollInterval = null;
    this.pollRate = 1000; // 1 second by default
  }
  
  connect() {
    // Start polling for telemetry data
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${this.serverUrl}/api/telemetry`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (!this.connected) {
            this.connected = true;
            this._notifyListeners('connection', { connected: true });
          }
          
          // Notify position listeners
          this._notifyListeners('position', {
            latitude: data.lat,
            longitude: data.lng,
            altitude: data.alt,
            timestamp: data.ts
          });
          
          // Notify velocity listeners
          this._notifyListeners('velocity', {
            north: data.vel.n,
            east: data.vel.e,
            down: data.vel.d,
            timestamp: data.ts
          });
          
          // Notify attitude listeners if available
          if (data.hdg !== undefined) {
            this._notifyListeners('attitude', {
              heading: data.hdg,
              timestamp: data.ts
            });
          }
        } else {
          if (this.connected) {
            this.connected = false;
            this._notifyListeners('connection', { connected: false });
          }
        }
      } catch (error) {
        console.error('Error fetching telemetry data:', error);
        if (this.connected) {
          this.connected = false;
          this._notifyListeners('connection', { connected: false });
        }
      }
    }, this.pollRate);
  }
  
  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    if (this.connected) {
      this.connected = false;
      this._notifyListeners('connection', { connected: false });
    }
  }
  
  onPosition(callback) {
    this.listeners.position.push(callback);
    return () => {
      this.listeners.position = this.listeners.position.filter(cb => cb !== callback);
    };
  }
  
  onVelocity(callback) {
    this.listeners.velocity.push(callback);
    return () => {
      this.listeners.velocity = this.listeners.velocity.filter(cb => cb !== callback);
    };
  }
  
  onAttitude(callback) {
    this.listeners.attitude.push(callback);
    return () => {
      this.listeners.attitude = this.listeners.attitude.filter(cb => cb !== callback);
    };
  }
  
  onConnectionChange(callback) {
    this.listeners.connection.push(callback);
    return () => {
      this.listeners.connection = this.listeners.connection.filter(cb => cb !== callback);
    };
  }
  
  _notifyListeners(type, data) {
    this.listeners[type].forEach(callback => callback(data));
  }
  
  setUpdateRate(rateHz) {
    // Convert Hz to milliseconds
    this.pollRate = Math.floor(1000 / rateHz);
    
    // Restart polling with new rate
    if (this.pollInterval) {
      this.disconnect();
      this.connect();
    }
  }
}

export default TelemetryClient;

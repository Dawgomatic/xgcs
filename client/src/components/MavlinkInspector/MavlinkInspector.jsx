import React, { useEffect, useState } from 'react';
import MavlinkMessageRow from './MavlinkMessageRow';

export default function MavlinkInspector({ vehicleId }) {
  const [messages, setMessages] = useState({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!vehicleId) return;
    const ws = new WebSocket(`ws://${window.location.hostname}:8081/api/mavlink/stream`);
    ws.onopen = () => {
      ws.send(vehicleId);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setMessages(prev => ({
        ...prev,
        [msg.msgName]: {
          lastFields: msg.fields,
          lastTimestamp: msg.timestamp,
          count: (prev[msg.msgName]?.count || 0) + 1
        }
      }));
    };
    return () => ws.close();
  }, [vehicleId]);

  const filtered = Object.entries(messages).filter(([msgName]) =>
    msgName.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <h2>MAVLink Inspector for {vehicleId}</h2>
      <input
        type="text"
        placeholder="Filter by message name"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <table>
        <thead>
          <tr>
            <th>Message</th>
            <th>Last Value</th>
            <th>Last Received</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(([msgName, data]) => (
            <MavlinkMessageRow key={msgName} msgName={msgName} data={data} />
          ))}
        </tbody>
      </table>
    </div>
  );
} 
import React, { useState } from 'react';

export default function MavlinkMessageRow({ msgName, data }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <td>{msgName}</td>
        <td>{JSON.stringify(data.lastFields)}</td>
        <td>{new Date(data.lastTimestamp).toLocaleTimeString()}</td>
        <td>{data.count}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4}>
            <pre>{JSON.stringify(data.lastFields, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
} 
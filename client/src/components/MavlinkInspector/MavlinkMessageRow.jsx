import React, { useState } from 'react';
import { Card, CardContent, CardActions, Collapse, IconButton, Typography, Box, Divider } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export default function MavlinkMessageRow({ msgName, data, missing }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card variant="outlined" sx={missing ? { opacity: 0.5, bgcolor: 'grey.100' } : {}}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>{msgName}</Typography>
          <IconButton
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            aria-label="show more"
            size="small"
            disabled={missing}
          >
            <ExpandMoreIcon style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }} />
          </IconButton>
        </Box>
        <Divider sx={{ my: 1 }} />
        {missing ? (
          <Typography variant="body2" color="text.secondary">Not Received</Typography>
        ) : (
          <>
            <Box display="flex" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">Last Received</Typography>
                <Typography variant="body2">{new Date(data.lastTimestamp).toLocaleTimeString()}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Count</Typography>
                <Typography variant="body2">{data.count}</Typography>
              </Box>
            </Box>
            <Box mt={1} display="flex" gap={4}>
              {data.system_id !== undefined && (
                <Box>
                  <Typography variant="caption" color="text.secondary">System ID</Typography>
                  <Typography variant="body2">{data.system_id}</Typography>
                </Box>
              )}
              {data.component_id !== undefined && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Component ID</Typography>
                  <Typography variant="body2">{data.component_id}</Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </CardContent>
      {!missing && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <CardContent sx={{ bgcolor: 'grey.50' }}>
            <Typography variant="subtitle2" gutterBottom>All Fields</Typography>
            <Box component="pre" sx={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
              {Object.entries(data.lastFields).map(([key, value]) => (
                <div key={key}><b>{key}:</b> {String(value)}</div>
              ))}
            </Box>
          </CardContent>
        </Collapse>
      )}
    </Card>
  );
} 
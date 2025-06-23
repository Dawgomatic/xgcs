import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Slider,
  Chip,
  Paper,
  Grid
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  Fullscreen,
  Settings,
  VolumeUp,
  VolumeOff,
  RecordVoiceOver,
  PhotoCamera
} from '@mui/icons-material';

// @hallucinated - React component for video streaming
// Maps from QGC FlyViewVideo.qml but uses modern React patterns
const VideoPanel = ({ vehicle }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [videoQuality, setVideoQuality] = useState('HD');
  const [recording, setRecording] = useState(false);
  const [videoStats, setVideoStats] = useState({
    fps: 0,
    bitrate: 0,
    resolution: '0x0',
    droppedFrames: 0
  });

  // Video stream URL - maps from QGC video manager
  const getVideoUrl = () => {
    if (!vehicle) return null;
    // @hallucinated - Video stream URL construction
    return `http://localhost:8081/video/${vehicle.id}/stream`;
  };

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const url = getVideoUrl();
    if (url) {
      videoElement.src = url;
      setIsPlaying(true);
    }

    // Video event handlers
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('ended', handleEnded);

    return () => {
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('ended', handleEnded);
    };
  }, [vehicle]);

  // Simulate video stats updates
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setVideoStats({
        fps: Math.floor(Math.random() * 30) + 15,
        bitrate: Math.floor(Math.random() * 2000) + 500,
        resolution: '1280x720',
        droppedFrames: Math.floor(Math.random() * 10)
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleVolumeChange = (event, newValue) => {
    setVolume(newValue);
    if (videoRef.current) {
      videoRef.current.volume = newValue / 100;
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const handleFullscreenToggle = () => {
    if (!videoRef.current) return;

    if (!isFullscreen) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleRecordToggle = () => {
    setRecording(!recording);
    // @hallucinated - Recording functionality
    console.log(recording ? 'Stopping recording' : 'Starting recording');
  };

  const handleCapturePhoto = () => {
    // @hallucinated - Photo capture functionality
    console.log('Capturing photo');
  };

  // Video controls overlay - maps from QGC video controls
  const VideoControls = () => (
    <Box sx={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      bgcolor: 'rgba(0, 0, 0, 0.7)',
      p: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 1
    }}>
      <IconButton 
        size="small" 
        color="inherit"
        onClick={handleMuteToggle}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeOff /> : <VolumeUp />}
      </IconButton>
      
      <Slider
        size="small"
        value={volume}
        onChange={handleVolumeChange}
        sx={{ 
          width: 80,
          color: 'white',
          '& .MuiSlider-thumb': {
            color: 'white'
          },
          '& .MuiSlider-track': {
            color: 'white'
          }
        }}
      />
      
      <Box sx={{ flexGrow: 1 }} />
      
      <IconButton 
        size="small" 
        color="inherit"
        onClick={handleCapturePhoto}
        title="Capture Photo"
      >
        <PhotoCamera />
      </IconButton>
      
      <IconButton 
        size="small" 
        color="inherit"
        onClick={handleRecordToggle}
        title={recording ? 'Stop Recording' : 'Start Recording'}
        sx={{ 
          color: recording ? 'error.main' : 'inherit'
        }}
      >
        <RecordVoiceOver />
      </IconButton>
      
      <IconButton 
        size="small" 
        color="inherit"
        onClick={handleFullscreenToggle}
        title="Fullscreen"
      >
        <Fullscreen />
      </IconButton>
    </Box>
  );

  // Video stats overlay - maps from QGC video stats
  const VideoStats = () => (
    <Box sx={{
      position: 'absolute',
      top: 8,
      right: 8,
      bgcolor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: 1,
      p: 1
    }}>
      <Grid container spacing={1}>
        <Grid item>
          <Chip 
            label={`${videoStats.fps} FPS`} 
            size="small" 
            color="primary"
            variant="outlined"
          />
        </Grid>
        <Grid item>
          <Chip 
            label={`${videoStats.bitrate} kbps`} 
            size="small" 
            color="secondary"
            variant="outlined"
          />
        </Grid>
        <Grid item>
          <Chip 
            label={videoQuality} 
            size="small" 
            color="info"
            variant="outlined"
          />
        </Grid>
      </Grid>
    </Box>
  );

  // Recording indicator
  const RecordingIndicator = () => {
    if (!recording) return null;

    return (
      <Box sx={{
        position: 'absolute',
        top: 8,
        left: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'rgba(255, 0, 0, 0.8)',
        borderRadius: 1,
        p: 1
      }}>
        <Box sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: 'white',
          animation: 'pulse 1s infinite'
        }} />
        <Typography variant="caption" color="white" fontWeight="bold">
          REC
        </Typography>
      </Box>
    );
  };

  if (!vehicle) {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <VideocamOff sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            No vehicle connected
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ position: 'relative' }}>
          {/* Video element */}
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '200px',
              objectFit: 'cover',
              backgroundColor: '#000'
            }}
            controls={false}
            autoPlay
            muted={isMuted}
            loop
          />
          
          {/* Video overlays */}
          <VideoControls />
          <VideoStats />
          <RecordingIndicator />
          
          {/* No video indicator */}
          {!isPlaying && (
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <VideocamOff sx={{ fontSize: 48, color: 'white', mb: 1 }} />
              <Typography variant="body2" color="white">
                No video stream
              </Typography>
            </Box>
          )}
        </Box>
        
        {/* Video info */}
        <Box sx={{ p: 1 }}>
          <Typography variant="body2" gutterBottom>
            {vehicle.id} - Camera Feed
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {videoStats.resolution} • {videoStats.fps} FPS
            </Typography>
            <Chip 
              label={recording ? 'Recording' : 'Live'} 
              size="small" 
              color={recording ? 'error' : 'success'}
              variant="outlined"
            />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default VideoPanel; 
/**
 * ArduPilot/PX4 Bootloader Protocol Implementation
 * Ported from QGroundControl (Bootloader.cc)
 * 
 * Uses Web Serial API for direct browser-to-vehicle communication
 */

class ArduPilotBootloader {
    constructor() {
        this.port = null;
        this.writer = null;
        this.reader = null;
        this.keepReading = false;

        // Protocol Constants (from Bootloader.h)
        this.PROTO_INSYNC = 0x12;
        this.PROTO_EOC = 0x20;
        this.PROTO_GET_SYNC = 0x21;
        this.PROTO_GET_DEVICE = 0x22;
        this.PROTO_CHIP_ERASE = 0x23;
        this.PROTO_PROG_MULTI = 0x27;
        this.PROTO_GET_CRC = 0x29;
        this.PROTO_BOOT = 0x30;

        // Device Info Constants
        this.INFO_BL_REV = 1;
        this.INFO_BOARD_ID = 2;
        this.INFO_BOARD_REV = 3;
        this.INFO_FLASH_SIZE = 4;

        this.PROG_MULTI_MAX = 64; // Safe chunk size
    }

    /**
     * Connect to a serial port
     */
    async connect() {
        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            return true;
        } catch (error) {
            console.error('Error connecting to serial port:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.port) {
            try {
                if (this.reader) {
                    await this.reader.cancel();
                    this.reader.releaseLock();
                }
                if (this.writer) {
                    this.writer.releaseLock();
                }
                await this.port.close();
            } catch (e) {
                console.error('Error closing port:', e);
            }
            this.port = null;
        }
    }

    /**
     * Send command and wait for response
     */
    async sendCommand(cmd, timeout = 1000) {
        const cmdBytes = new Uint8Array([cmd, this.PROTO_EOC]);
        await this.write(cmdBytes);

        try {
            await this.getCommandResponse(timeout);
            return true;
        } catch (e) {
            console.error(`Command ${cmd.toString(16)} failed:`, e);
            return false;
        }
    }

    /**
     * Write data to serial port
     */
    async write(data) {
        if (!this.port || !this.port.writable) throw new Error('Port not writable');
        const writer = this.port.writable.getWriter();
        try {
            await writer.write(data);
        } finally {
            writer.releaseLock();
        }
    }

    /**
     * Read specific number of bytes
     */
    async read(length, timeout = 2000) {
        if (!this.port || !this.port.readable) throw new Error('Port not readable');

        const reader = this.port.readable.getReader();
        const buffer = new Uint8Array(length);
        let bytesRead = 0;

        // Timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Read timeout')), timeout)
        );

        try {
            while (bytesRead < length) {
                // race between read and timeout
                const readPromise = reader.read();
                const { value, done } = await Promise.race([readPromise, timeoutPromise]);

                if (done) break;
                if (value) {
                    buffer.set(value, bytesRead);
                    bytesRead += value.length;
                }
            }
        } finally {
            reader.releaseLock();
        }

        if (bytesRead < length) throw new Error(`Read incomplete: ${bytesRead}/${length}`);
        return buffer.slice(0, bytesRead); // Return only what we got, though typical usage expects full length
    }

    /**
     * Wait for sync/OK response
     */
    async getCommandResponse(timeout) {
        // We expect PROTO_INSYNC (0x12) followed by PROTO_OK (0x10)
        const bytes = await this.read(2, timeout);
        if (bytes[0] !== this.PROTO_INSYNC) throw new Error(`Invalid sync: ${bytes[0].toString(16)}`);
        if (bytes[1] !== 0x10) throw new Error(`Command failed code: ${bytes[1].toString(16)}`);
        return true;
    }

    /**
     * Synchronize with bootloader
     */
    async sync() {
        for (let i = 0; i < 3; i++) {
            try {
                // Send GET_SYNC + EOC
                const cmd = new Uint8Array([this.PROTO_GET_SYNC, this.PROTO_EOC]);
                await this.write(cmd);

                // Read response
                await this.getCommandResponse(1000);
                return true;
            } catch (e) {
                console.log(`Sync attempt ${i + 1} failed`);
                await new Promise(r => setTimeout(r, 100)); // Sleep 100ms
            }
        }
        return false;
    }

    /**
     * Get Board Info
     */
    async getBoardInfo() {
        const info = {};

        // Get Board ID
        await this.write(new Uint8Array([this.PROTO_GET_DEVICE, this.INFO_BOARD_ID, this.PROTO_EOC]));
        let valBytes = await this.read(4); // returns uint32
        await this.getCommandResponse(1000);
        info.boardId = new DataView(valBytes.buffer).getUint32(0, true); // Little endian

        // Get Flash Size
        await this.write(new Uint8Array([this.PROTO_GET_DEVICE, this.INFO_FLASH_SIZE, this.PROTO_EOC]));
        valBytes = await this.read(4);
        await this.getCommandResponse(1000);
        info.flashSize = new DataView(valBytes.buffer).getUint32(0, true);

        return info;
    }

    /**
     * Erase Chip
     */
    async erase() {
        // Send PROTO_CHIP_ERASE + EOC
        // This takes a long time (up to 20s)
        const cmd = new Uint8Array([this.PROTO_CHIP_ERASE, this.PROTO_EOC]);
        await this.write(cmd);

        // Wait for response with long timeout
        await this.getCommandResponse(30000);
        return true;
    }

    /**
     * Program Flash
     */
    async program(firmwareBuffer, progressCallback) {
        const view = new Uint8Array(firmwareBuffer);
        const totalSize = view.length;
        let bytesSent = 0;

        // Calculate CRC as we go (QGC logic: simple CRC32)
        let crc = 0;

        while (bytesSent < totalSize) {
            let chunkSize = Math.min(this.PROG_MULTI_MAX, totalSize - bytesSent);

            // Construct packet: PROTO_PROG_MULTI | Length | Data... | PROTO_EOC
            const packet = new Uint8Array(2 + chunkSize + 1);
            packet[0] = this.PROTO_PROG_MULTI;
            packet[1] = chunkSize;
            packet.set(view.slice(bytesSent, bytesSent + chunkSize), 2);
            packet[2 + chunkSize] = this.PROTO_EOC;

            await this.write(packet);
            await this.getCommandResponse(1000);

            bytesSent += chunkSize;
            if (progressCallback) progressCallback(bytesSent, totalSize);
        }

        return true; // We don't implement on-the-fly CRC calc here yet, relying on verify step
    }

    /**
     * Verify Flash (CRC Check)
     */
    async verify(localCRC) {
        // Send PROTO_GET_CRC + EOC
        const cmd = new Uint8Array([this.PROTO_GET_CRC, this.PROTO_EOC]);
        await this.write(cmd);

        const crcBytes = await this.read(4);
        await this.getCommandResponse(1000);

        const remoteCRC = new DataView(crcBytes.buffer).getUint32(0, true);

        // Note: QGC calculates CRC of the file padded with 0xFF to full flash size
        // For now we assume strict check, but implementers should be aware

        return remoteCRC;
    }

    /**
     * Reboot
     */
    async reboot() {
        const cmd = new Uint8Array([this.PROTO_BOOT, this.PROTO_EOC]);
        await this.write(cmd);
        return true;
    }
}

export default ArduPilotBootloader;

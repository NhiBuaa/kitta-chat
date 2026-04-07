/**
 * AudioManager - Quản lý phát âm thanh thông báo trong ứng dụng
 */
class AudioManager {
    constructor() {
        this._sounds = {};
    }

    /**
     * Lấy hoặc tạo Audio instance cho một sound
     * @param {string} src - Đường dẫn file audio
     * @returns {HTMLAudioElement}
     */
    getSound(src) {
        if (!this._sounds[src]) {
            this._sounds[src] = new Audio(src);
        }
        return this._sounds[src];
    }

    /**
     * Phát âm thanh thông báo tin nhắn
     */
    playMessageNotification() {
        try {
            const audio = this.getSound("/audio/audio-toast.mp3");
            audio.currentTime = 0;
            audio.play().catch(() => {
                // Autoplay bị chặn → không làm gì
            });
        } catch (error) {
            console.error("[AudioManager] Lỗi phát âm thanh:", error);
        }
    }
}

export const audioManager = new AudioManager();

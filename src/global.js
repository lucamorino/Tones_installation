export default {
    isPlaying: {
        type: 'boolean',
        default: false
    },
    startSyncTime: {
        type: 'float',
        default: 0
    },
    volume: {
        type: 'float',
        default: 0.7,
        min: 0,
        max: 1
    }
}

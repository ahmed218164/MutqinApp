package com.mutqin.liveaudiostream

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.sqrt

class LiveAudioStreamModule : Module() {
  private val TAG = "LiveAudioStream"
  private var audioRecord: AudioRecord? = null
  private val isRecording = AtomicBoolean(false)
  private var recordingThread: Thread? = null

  private val context: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("LiveAudioStream")

    Events("onAudioChunk", "onError")

    Function("isAvailable") {
      true
    }

    Function("isStreaming") {
      isRecording.get()
    }

    AsyncFunction("startStreaming") { options: Map<String, Any>? ->
      if (isRecording.get()) {
        Log.w(TAG, "Recording is already active.")
        return@AsyncFunction true
      }

      val currentContext = context ?: run {
        sendEvent("onError", mapOf("message" to "React context unavailable"))
        return@AsyncFunction false
      }

      val permissionCheck = ContextCompat.checkSelfPermission(
        currentContext,
        Manifest.permission.RECORD_AUDIO
      )

      if (permissionCheck != PackageManager.PERMISSION_GRANTED) {
        val errorMsg = "RECORD_AUDIO permission not granted"
        Log.e(TAG, errorMsg)
        sendEvent("onError", mapOf("message" to errorMsg))
        return@AsyncFunction false
      }

      val sampleRate = (options?.get("sampleRate") as? Number)?.toInt() ?: 16000
      val channelConfig = AudioFormat.CHANNEL_IN_MONO
      val audioFormat = AudioFormat.ENCODING_PCM_16BIT

      // Chunks of 100ms at 16kHz (1600 samples * 2 bytes/sample = 3200 bytes)
      val chunkSizeInBytes = (sampleRate * 2 * 0.1).toInt().coerceAtLeast(1024)
      val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
      val bufferSize = maxOf(minBufferSize * 2, chunkSizeInBytes * 2)

      var recordInstance: AudioRecord? = null
      val audioSources = intArrayOf(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        MediaRecorder.AudioSource.MIC
      )

      for (source in audioSources) {
        try {
          val record = AudioRecord(source, sampleRate, channelConfig, audioFormat, bufferSize)
          if (record.state == AudioRecord.STATE_INITIALIZED) {
            recordInstance = record
            break
          } else {
            record.release()
          }
        } catch (e: Exception) {
          Log.w(TAG, "Failed initializing AudioRecord with source $source: ${e.message}")
        }
      }

      if (recordInstance == null || recordInstance.state != AudioRecord.STATE_INITIALIZED) {
        val errorMsg = "AudioRecord initialization failed."
        Log.e(TAG, errorMsg)
        sendEvent("onError", mapOf("message" to errorMsg))
        return@AsyncFunction false
      }

      audioRecord = recordInstance

      try {
        recordInstance.startRecording()
      } catch (e: Exception) {
        Log.e(TAG, "AudioRecord startRecording failed: ${e.message}")
        sendEvent("onError", mapOf("message" to (e.message ?: "startRecording failed")))
        recordInstance.release()
        audioRecord = null
        return@AsyncFunction false
      }

      isRecording.set(true)

      recordingThread = thread(start = true, name = "LiveAudioStreamThread") {
        val audioBuffer = ByteArray(chunkSizeInBytes)

        while (isRecording.get()) {
          val bytesRead = recordInstance.read(audioBuffer, 0, audioBuffer.size)
          if (bytesRead > 0 && isRecording.get()) {
            // Calculate RMS volume level
            var sum = 0.0
            var sampleCount = 0
            var i = 0
            while (i < bytesRead - 1) {
              val sample = ((audioBuffer[i + 1].toInt() shl 8) or (audioBuffer[i].toInt() and 0xFF)).toShort()
              sum += (sample * sample).toDouble()
              sampleCount++
              i += 2
            }

            val rms = if (sampleCount > 0) sqrt(sum / sampleCount) else 0.0
            val normalizedVolume = (rms / 32768.0 * 3.0).coerceIn(0.0, 1.0)

            val base64Data = Base64.encodeToString(audioBuffer, 0, bytesRead, Base64.NO_WRAP)

            sendEvent(
              "onAudioChunk",
              mapOf(
                "data" to base64Data,
                "volume" to normalizedVolume,
                "bytesRead" to bytesRead,
                "sampleRate" to sampleRate
              )
            )
          } else if (bytesRead < 0) {
            Log.w(TAG, "AudioRecord read error code: $bytesRead")
            break
          }
        }
      }

      Log.i(TAG, "LiveAudioStream recording started (sampleRate: $sampleRate, chunkSize: $chunkSizeInBytes bytes)")
      true
    }

    AsyncFunction("stopStreaming") {
      stopRecordingInternal()
      true
    }

    OnDestroy {
      stopRecordingInternal()
    }
  }

  private fun stopRecordingInternal() {
    if (isRecording.compareAndSet(true, false)) {
      try {
        recordingThread?.interrupt()
        recordingThread = null

        audioRecord?.apply {
          if (recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            stop()
          }
          release()
        }
        audioRecord = null
        Log.i(TAG, "LiveAudioStream recording stopped and resources released.")
      } catch (e: Exception) {
        Log.e(TAG, "Error stopping LiveAudioStream: ${e.message}")
      }
    }
  }
}

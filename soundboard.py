import os
import serial
import subprocess
import time

PORT = '/dev/cu.usbserial-0001'
BAUD = 115200

AUDIO_FILES = {
    '1': 'suara1.mp3',
    '2': 'suara2.mp3',
    '3': 'suara3.mp3',
    '4': 'suara4.mp3',
    '5': 'suara5.mp3',
    '6': 'suara6.mp3',
}

current_process = None


def play_audio(file_name):
  global current_process

  if not os.path.exists(file_name):
    print(f'File tidak ditemukan: {file_name}')
    return

  if current_process is not None and current_process.poll() is None:
    current_process.terminate()
    current_process.wait()

  current_process = subprocess.Popen(['afplay', file_name])


try:
  # Timeout 1 detik: readline() akan idle/menunggu tanpa membebani CPU
  ser = serial.Serial(PORT, BAUD, timeout=1)
  print(f'Terhubung ke {PORT}! CPU usage dioptimalkan.')
  time.sleep(2)

  while True:
    # readline() memblokir eksekusi secara pasif sampai ada byte masuk atau timeout
    line = ser.readline().decode('utf-8', errors='ignore').strip()

    if line:
      if line in AUDIO_FILES:
        print(f'Tombol {line} ditekan -> Putar {AUDIO_FILES[line]}')
        play_audio(AUDIO_FILES[line])

    # Beri jeda mikroskopis (10ms) agar thread idle sepenuhnya
    time.sleep(0.01)

except serial.SerialException as e:
  print(f'Gagal membuka port {PORT}: {e}')
  print('Pastikan Serial Monitor di Arduino IDE sudah DITUTUP!')
except KeyboardInterrupt:
  if current_process is not None and current_process.poll() is None:
    current_process.terminate()
  print('\nProgram dihentikan.')
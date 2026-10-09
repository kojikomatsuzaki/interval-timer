# テスト用音声

generated-chime.mp3は本プロジェクトのaudio/soft-chime.wav（scripts/generate-audio.pyで数式から生成）をMP3へ変換したテスト専用ファイルです。第三者の録音・サンプルは使用していません。

再生成例：`ffmpeg -i audio/soft-chime.wav -codec:a libmp3lame -b:a 96k -map_metadata -1 tests/fixtures/generated-chime.mp3`。

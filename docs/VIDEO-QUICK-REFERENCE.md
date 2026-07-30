# 🎬 Video Generation - Quick Reference Card

## Copy-Paste Prompts for Gemini Pro

### Video 1: Front Smile (6 sec)
```
Medical demonstration video: Adult person facing camera, neutral start, gradually smiling wide showing 8-12 front teeth (upper and lower incisors and canines), hold smile steady. White clinical background, bright medical lighting, 1080x1080, 6 seconds, professional medical instruction style.
```

### Video 2: Left Lateral (7 sec)
```
Medical demonstration video: Same person starts facing forward, turns head 45° to their right (camera sees left side), opens mouth wide showing left side molars and premolars (4-6 teeth visible), hold position. White clinical background, bright lighting, 1080x1080, 7 seconds, dental examination angle.
```

### Video 3: Right Lateral (7 sec)
```
Medical demonstration video: Same person starts facing forward, turns head 45° to their left (camera sees right side), opens mouth wide showing right side molars and premolars (4-6 teeth visible), hold position. White clinical background, bright lighting, 1080x1080, 7 seconds, mirror of left-lateral.
```

---

## 📋 Generation Checklist

### Before Starting:
- [ ] Choose resolution: 1080x1080 (square) or 720x1280 (portrait)
- [ ] Confirm Gemini Pro account is active
- [ ] Have FFmpeg ready for compression

### During Generation (for each video):
- [ ] Copy exact prompt from above
- [ ] Add: "Continue with same subject and style" (for videos 2-3)
- [ ] Check teeth are visible in preview
- [ ] Verify movement is smooth
- [ ] Confirm proper lighting
- [ ] Accept video or regenerate

### After Generation:
- [ ] Download all 3 videos
- [ ] Check file sizes (should be < 10MB each raw)
- [ ] Compress with FFmpeg (see commands below)
- [ ] Place in correct folders

---

## 🔧 One-Line Compression Commands

```bash
# Quick compress all 3 (run in folder with raw videos)
for f in *-raw.mp4; do ffmpeg -i "$f" -vcodec h264 -b:v 800k -an "${f%-raw.mp4}.mp4"; done

# Or individually:
ffmpeg -i front-smile-raw.mp4 -vcodec h264 -b:v 800k -an front-smile.mp4
ffmpeg -i left-lateral-raw.mp4 -vcodec h264 -b:v 800k -an left-lateral.mp4
ffmpeg -i right-lateral-raw.mp4 -vcodec h264 -b:v 800k -an right-lateral.mp4
```

---

## 📁 Final Placement

```bash
# Create folders
mkdir -p website/public/videos/guides
mkdir -p BestoClinicMobile/src/assets/videos/guides

# Copy files
cp front-smile.mp4 left-lateral.mp4 right-lateral.mp4 website/public/videos/guides/

cp front-smile.mp4 left-lateral.mp4 right-lateral.mp4 BestoClinicMobile/src/assets/videos/guides/
```

---

## 🎯 Target Specs

| Video | Duration | Size (Web) | Size (Mobile) |
|-------|----------|------------|---------------|
| front-smile | 6s | 1.5-2MB | 800KB-1MB |
| left-lateral | 7s | 1.8-2MB | 900KB-1MB |
| right-lateral | 7s | 1.8-2MB | 900KB-1MB |
| **TOTAL** | **20s** | **5-6MB** | **2.5-3MB** |

---

## ⚡ Expected Timeline

- Generate Video 1: 3-5 minutes
- Generate Videos 2-3: 2-3 min each (using "same subject")
- Total generation: **10-15 minutes**
- Compression: **3-5 minutes**
- File placement: **2 minutes**

**Total time: 15-25 minutes** ⏱️

---

## 🚨 Troubleshooting

**Teeth not visible?**
→ Regenerate with: "Make teeth MORE clearly visible, zoom in closer"

**Movement too fast?**
→ Add to prompt: "Slow, gradual, smooth movement"

**Subject changes between videos?**
→ Always add: "Continue with exact same person from previous video"

**Only need 3 videos?**
→ Yes! Front smile, left side, and right side - that's all we need

**Video too long?**
→ Use FFmpeg to trim: `ffmpeg -i input.mp4 -ss 0 -t 6 output.mp4`

**File too large?**
→ Reduce bitrate: `ffmpeg -i input.mp4 -b:v 500k output.mp4`

---

## ✅ Quality Check

Before accepting each video, verify:
- [ ] Teeth are IN FOCUS and CLEARLY VISIBLE
- [ ] Movement is SMOOTH (not jerky)
- [ ] Hold at end is STEADY (not moving)
- [ ] Lighting is BRIGHT and EVEN
- [ ] Background is CLEAN WHITE
- [ ] Duration is 6-7 seconds
- [ ] Same person as previous videos (2-3)

---

**That's it!** 🎉 Follow these quick prompts and you'll have professional dental scan guide videos in under 30 minutes!

For detailed technical specs, see: [GEMINI-VIDEO-PROMPTS.md](./GEMINI-VIDEO-PROMPTS.md)

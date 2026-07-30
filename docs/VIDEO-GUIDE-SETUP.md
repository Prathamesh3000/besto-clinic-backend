# 🎥 Video Guide Setup - Complete Instructions

## Quick Start (30 minutes)

You need **6 short videos** (5-8 seconds each) showing jaw positions. Total filming time: **~30 minutes!**

---

## 📹 What You Need

### Equipment:
- ✅ **Smartphone** (iPhone or Android with good camera)
- ✅ **Tripod or phone stand** (or stack of books)
- ✅ **Good lighting** (window light or ring light)
- ✅ **Plain background** (white wall or solid color)
- ✅ **1 person** to demonstrate

### Optional but helpful:
- Ring light ($20-50 on Amazon)
- Green screen backdrop ($15)
- Microphone (not needed - videos are muted)

---

## 🎬 Recording Setup

### Camera Settings:
```
Resolution: 1080p (1920x1080) or 720p
Format: MP4
Frame rate: 30fps
Orientation: Portrait (vertical) or Square (1:1)
Duration: 5-8 seconds per video
```

### Lighting Setup:
```
Option 1 (Natural Light):
- Face a large window
- Film during daytime
- Person faces the light

Option 2 (Ring Light):
- Place ring light 2-3 feet from face
- Eye level
- Brightness: 60-80%
```

### Camera Position:
```
Distance: 3-4 feet from person
Height: Eye level
Angle: Straight on (not looking up or down)
Frame: Show head and upper shoulders
```

---

## 📝 Recording Script

### Video 1: Front Smile (front-smile.mp4)
```
Duration: 6 seconds
Action: Person faces camera, gives big smile showing teeth
Key points:
- Start neutral
- Smile wide at second 2
- Hold smile until end
- Show upper and lower front teeth clearly
```

**Filming notes**:
- Camera straight ahead
- Person directly faces camera
- Encourage natural, big smile

---

### Video 2: Left Lateral (left-lateral.mp4)
```
Duration: 7 seconds
Action: Person turns head to the right, opens mouth
Key points:
- Start neutral facing camera
- Turn head 45° to the right (camera sees left side of face)
- Open mouth wide to show left side teeth
- Hold position
```

**Filming notes**:
- Camera stays in same position
- Person's left side teeth should be visible
- Mouth open wider than normal

---

### Video 3: Right Lateral (right-lateral.mp4)
```
Duration: 7 seconds
Action: Person turns head to the left, opens mouth
Key points:
- Start neutral facing camera
- Turn head 45° to the left (camera sees right side of face)
- Open mouth wide to show right side teeth
- Hold position
```

**Filming notes**:
- Mirror of Video 2
- Person's right side teeth visible

---

### Video 4: Upper Occlusal (upper-occlusal.mp4)
```
Duration: 7 seconds
Action: Person tilts head back, opens mouth
Key points:
- Start neutral
- Tilt head back slightly (20°)
- Open mouth wide
- Camera should see biting surface of top teeth
```

**Filming notes**:
- Hardest angle to capture
- May need to adjust camera angle slightly up
- Make sure top teeth visible

---

### Video 5: Lower Occlusal (lower-occlusal.mp4)
```
Duration: 7 seconds
Action: Person tilts head forward, opens mouth
Key points:
- Start neutral
- Tilt head forward slightly (20°)
- Open mouth wide
- Camera should see biting surface of bottom teeth
```

**Filming notes**:
- Opposite of Video 4
- May need to adjust camera angle slightly down

---

### Video 6: Close Smile (close-smile.mp4)
```
Duration: 6 seconds
Action: Person faces camera, gentle natural smile
Key points:
- Start neutral
- Give natural, relaxed smile
- Lips slightly parted showing front teeth
- More subtle than Video 1
```

**Filming notes**:
- Same setup as Video 1
- Softer, more natural smile
- Can zoom in slightly for close-up

---

## 🎞️ After Recording: Video Processing

### Step 1: Transfer videos to computer
```bash
# Create folder structure
mkdir -p website/public/videos/guides
mkdir -p BestoClinicMobile/src/assets/videos/guides
```

### Step 2: Compress videos (IMPORTANT!)

**Install FFmpeg** (free):
- Mac: `brew install ffmpeg`
- Windows: Download from https://ffmpeg.org/
- Linux: `sudo apt install ffmpeg`

**Compression commands**:

```bash
# For Website (720x720 square, 800kb bitrate)
ffmpeg -i front-smile-raw.mp4 -vf "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2" -vcodec h264 -b:v 800k -an front-smile.mp4

# For Mobile (720x1280 portrait, 500kb bitrate)
ffmpeg -i front-smile-raw.mp4 -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2" -vcodec h264 -b:v 500k -an front-smile.mp4

# Quick version (maintains aspect ratio, good compression)
ffmpeg -i input.mp4 -vcodec h264 -b:v 600k -an output.mp4
```

**Target file sizes**:
- Website: < 2MB per video
- Mobile: < 1MB per video

### Step 3: Batch process all 6 videos

Create a script `compress-videos.sh`:
```bash
#!/bin/bash

# Input files
VIDEOS=("front-smile" "left-lateral" "right-lateral" "upper-occlusal" "lower-occlusal" "close-smile")

# Compress for web
for video in "${VIDEOS[@]}"; do
  echo "Compressing $video for web..."
  ffmpeg -i "raw/${video}-raw.mp4" -vcodec h264 -b:v 800k -s 720x720 -an "website/public/videos/guides/${video}.mp4"
done

# Compress for mobile
for video in "${VIDEOS[@]}"; do
  echo "Compressing $video for mobile..."
  ffmpeg -i "raw/${video}-raw.mp4" -vcodec h264 -b:v 500k -s 720x1280 -an "BestoClinicMobile/src/assets/videos/guides/${video}.mp4"
done

echo "✅ All videos compressed!"
```

Run: `bash compress-videos.sh`

---

## 🚀 Alternative Options (If you don't want to film)

### Option 1: Stock Video Clips
**Free sources**:
- Pexels: https://www.pexels.com/search/videos/smile/
- Pixabay: https://pixabay.com/videos/search/dental/

**Search terms**:
- "person smiling teeth"
- "woman opening mouth"
- "dental exam"

**Download 6 different clips**, trim to 5-8 seconds each.

---

### Option 2: Use AI-Generated Video
**Runway ML** ($12/month): https://runwayml.com/

**Prompts**:
```
1. "Close-up of person's face giving big smile showing teeth"
2. "Person turning head to the right with mouth open"
3. "Person turning head to the left with mouth open"
4. "Person tilting head back with mouth open showing top teeth"
5. "Person tilting head forward with mouth open showing bottom teeth"
6. "Person with gentle natural smile, close-up"
```

**Settings**:
- Duration: 6 seconds
- Resolution: 720p
- Style: Realistic

---

### Option 3: Animated Character (Cartoonish but effective)
**Vyond** (Free trial): https://www.vyond.com/

Create simple animated character demonstrating the 6 positions.

**Pros**:
- No real person needed
- Professional looking
- Easy to edit

**Cons**:
- Costs money after trial
- Takes 1-2 hours to animate

---

## ✅ Quick Checklist

Before you start:
- [ ] Camera/phone charged
- [ ] Good lighting (natural or ring light)
- [ ] Plain background
- [ ] Tripod or stand set up
- [ ] Person ready to demonstrate

After recording:
- [ ] All 6 videos recorded
- [ ] Videos transferred to computer
- [ ] FFmpeg installed
- [ ] Videos compressed
- [ ] Files placed in correct folders
- [ ] Test videos load in app

---

## 🎯 What Good Videos Look Like

### ✅ GOOD Example:
```
✓ Clear, well-lit face
✓ Teeth clearly visible
✓ Smooth motion (not jerky)
✓ Proper angle demonstration
✓ File size under 2MB
✓ 5-8 seconds duration
✓ Loops smoothly
```

### ❌ BAD Example:
```
✗ Too dark or overexposed
✗ Face too far away
✗ Shaky camera
✗ Wrong angle
✗ File size over 5MB
✗ Too long (>15 seconds)
✗ Abrupt start/end
```

---

## 💡 Pro Tips

1. **Record each video 3 times** - pick the best
2. **Use a timer/countdown** before starting action
3. **Add 2 seconds padding** at start/end (trim later)
4. **Keep mouth closed at start** then open
5. **Hold the pose** at the end for 2-3 seconds
6. **Smile naturally** - avoid forced expressions
7. **Use the same person** for all 6 videos (consistency)
8. **Film in one session** (same lighting/setup)

---

## 🔧 Troubleshooting

**Video too large?**
```bash
# Reduce bitrate further
ffmpeg -i input.mp4 -b:v 400k output.mp4
```

**Video too dark?**
```bash
# Brighten video
ffmpeg -i input.mp4 -vf "eq=brightness=0.15" output.mp4
```

**Wrong aspect ratio?**
```bash
# Crop to square
ffmpeg -i input.mp4 -vf "crop=min(iw\,ih):min(iw\,ih)" output.mp4
```

**Video won't loop smoothly?**
```bash
# Fade in/out for smooth loop
ffmpeg -i input.mp4 -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=5:d=0.5" output.mp4
```

---

## 📦 Final Folder Structure

```
website/public/videos/guides/
├── front-smile.mp4      (< 2MB)
├── left-lateral.mp4     (< 2MB)
├── right-lateral.mp4    (< 2MB)
├── upper-occlusal.mp4   (< 2MB)
├── lower-occlusal.mp4   (< 2MB)
└── close-smile.mp4      (< 2MB)

BestoClinicMobile/src/assets/videos/guides/
├── front-smile.mp4      (< 1MB)
├── left-lateral.mp4     (< 1MB)
├── right-lateral.mp4    (< 1MB)
├── upper-occlusal.mp4   (< 1MB)
├── lower-occlusal.mp4   (< 1MB)
└── close-smile.mp4      (< 1MB)
```

---

## 🚀 Ready to Go!

Once videos are in place:
1. Videos auto-loop in the guide component
2. Users see exactly what to do
3. Smooth transitions between positions
4. No complicated 3D models needed!

**Total setup time**: 30 min filming + 30 min editing = **1 hour!** 🎉

---

## 📞 Need Help?

**Quick video recording service** on Fiverr:
- Search: "dental video demonstration"
- Cost: $20-50 for all 6 videos
- Delivery: 2-3 days

**Or use our CSS placeholder** until videos ready - system works without videos too!

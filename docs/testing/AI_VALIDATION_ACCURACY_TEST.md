# AI Validation Accuracy Test - 50 Image Dataset

## Overview
Test the AI validation and teeth detection accuracy using a controlled dataset of 50 test images.

**Goal:** Validate that Google Gemini 2.5 Flash correctly:
1. Validates frame positioning (head orientation, teeth visibility)
2. Detects tooth numbers using FDI notation
3. Identifies correct quadrants per angle

---

## Test Dataset Structure

### Category Distribution (50 images total)

#### **Category A: Perfect Positioning** (10 images)
- **LEFT angle** (4 images): Head turned right 30-45°, Q2+Q3 teeth visible
- **FRONT angle** (3 images): Direct face, anterior teeth visible
- **RIGHT angle** (3 images): Head turned left 30-45°, Q1+Q4 teeth visible

**Expected Results:**
- ✅ Validation: `valid: true`, `confidence: >0.8`
- ✅ Teeth detection: Count within ±2 of expected
- ✅ Quadrants: Correct quadrants detected

#### **Category B: Slight Misalignment** (10 images)
- **Scenarios:**
  - Head orientation slightly off (±10° from ideal)
  - Mouth not fully open
  - Teeth partially visible

**Expected Results:**
- ⚠️ Validation: `valid: true` (60-80%), `confidence: 0.6-0.8`
- ⚠️ Teeth detection: Reduced count acceptable
- ⚠️ Quadrants: May miss some quadrants

#### **Category C: Wrong Angle** (10 images)
- **Scenarios:**
  - LEFT image submitted as FRONT
  - RIGHT image submitted as LEFT
  - Completely wrong orientation

**Expected Results:**
- ❌ Validation: `valid: false`, `confidence: <0.5`
- ❌ Feedback: "Incorrect head orientation"

#### **Category D: Blurry/Poor Quality** (10 images)
- **Scenarios:**
  - Motion blur
  - Out of focus
  - Low lighting

**Expected Results:**
- ❌ Validation: `valid: false`, `confidence: <0.5`
- ❌ Feedback: "Image quality too low" or "blurred"

#### **Category E: No Teeth Visible** (10 images)
- **Scenarios:**
  - Mouth closed
  - Lips covering teeth
  - Face only (no dental visibility)

**Expected Results:**
- ❌ Validation: `valid: false`, `confidence: <0.3`
- ❌ Feedback: "Teeth not visible" or "Open your mouth wider"

---

## Data Collection Methods

### Option 1: Use Existing Dental Stock Images
1. Download royalty-free dental photos from:
   - Unsplash (search: "dental smile", "teeth")
   - Pexels (search: "orthodontics", "dental")
   - Pixabay (dental category)

2. Organize into folders:
   ```
   test-dataset/
   ├── perfect/
   │   ├── left/
   │   ├── front/
   │   └── right/
   ├── slight-misalignment/
   ├── wrong-angle/
   ├── blurry/
   └── no-teeth/
   ```

### Option 2: Generate Test Images (Team Members)
1. Ask 5-10 team members to take selfie-style dental photos
2. Each person provides:
   - 1 perfect LEFT angle
   - 1 perfect FRONT angle
   - 1 perfect RIGHT angle
   - 1-2 intentionally poor images (blurry, wrong angle, etc.)

### Option 3: Use Previous Real Scan Data (If Available)
- Export images from completed scans in test database
- Anonymize/de-identify patient data
- Label images by quality category

---

## Test Execution Script

Create a test script at: `scripts/test-ai-validation-accuracy.js`

```javascript
/**
 * AI Validation Accuracy Test Script
 * Tests validateDentalFrame() and detectTeethInFrame() against 50-image dataset
 */

const fs = require('fs');
const path = require('path');
const { validateDentalFrame, detectTeethInFrame } = require('../src/services/aiAnalysis.service');

const TEST_DATASET_PATH = path.join(__dirname, '../test-dataset');

// Expected results per category
const EXPECTATIONS = {
  perfect: {
    validationPassRate: 0.90, // 90% should pass
    avgConfidence: 0.8,
    teethDetectionTolerance: 2, // ±2 teeth from expected
  },
  'slight-misalignment': {
    validationPassRate: 0.70,
    avgConfidence: 0.65,
    teethDetectionTolerance: 4,
  },
  'wrong-angle': {
    validationPassRate: 0.10, // Should mostly fail
    avgConfidence: 0.4,
  },
  blurry: {
    validationPassRate: 0.15,
    avgConfidence: 0.45,
  },
  'no-teeth': {
    validationPassRate: 0.0, // Should all fail
    avgConfidence: 0.3,
  },
};

const EXPECTED_TEETH_COUNT = {
  left: 14, // Q2+Q3
  front: 8, // Anterior
  right: 14, // Q1+Q4
};

const EXPECTED_QUADRANTS = {
  left: ['Q2', 'Q3'],
  front: ['Q1', 'Q2', 'Q3', 'Q4'], // May see all quadrants
  right: ['Q1', 'Q4'],
};

async function runAccuracyTest() {
  console.log('🔬 AI Validation Accuracy Test - 50 Image Dataset\n');

  const categories = ['perfect', 'slight-misalignment', 'wrong-angle', 'blurry', 'no-teeth'];
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    byCategory: {},
  };

  for (const category of categories) {
    console.log(`\n📁 Testing category: ${category}`);
    const categoryPath = path.join(TEST_DATASET_PATH, category);

    if (!fs.existsSync(categoryPath)) {
      console.warn(`  ⚠️  Category folder not found: ${categoryPath}`);
      continue;
    }

    const images = fs.readdirSync(categoryPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    console.log(`  Found ${images.length} images`);

    const categoryResults = {
      total: images.length,
      validationPassed: 0,
      avgConfidence: 0,
      teethDetectionAccuracy: [],
    };

    for (const imgFile of images) {
      const imgPath = path.join(categoryPath, imgFile);
      const base64 = fs.readFileSync(imgPath).toString('base64');
      const mimeType = 'image/jpeg';

      // Infer expected angle from filename (e.g., "left_01.jpg", "front_02.jpg")
      const angleMatch = imgFile.match(/(left|front|right)/i);
      const expectedAngle = angleMatch ? angleMatch[1].toLowerCase() : 'front';

      try {
        // Test 1: Frame Validation
        const validationResult = await validateDentalFrame(base64, mimeType, expectedAngle);
        console.log(`  ✓ ${imgFile}: valid=${validationResult.valid}, conf=${validationResult.confidence.toFixed(2)}`);

        categoryResults.avgConfidence += validationResult.confidence;
        if (validationResult.valid) {
          categoryResults.validationPassed++;
        }

        // Test 2: Teeth Detection (only for valid images)
        if (validationResult.valid && category === 'perfect') {
          const teethResult = await detectTeethInFrame(base64, mimeType, expectedAngle);
          const expectedCount = EXPECTED_TEETH_COUNT[expectedAngle];
          const detectedCount = teethResult.teethVisible.length;
          const accuracy = Math.abs(detectedCount - expectedCount);

          categoryResults.teethDetectionAccuracy.push(accuracy);

          console.log(`    Teeth detected: ${detectedCount} (expected ${expectedCount}, diff=${accuracy})`);
          console.log(`    Quadrants: ${teethResult.quadrants.join(', ')}`);
        }

        results.total++;
        results.passed++;

      } catch (error) {
        console.error(`  ✗ ${imgFile}: ${error.message}`);
        results.failed++;
        results.total++;
      }

      // Rate limit: 1 request per second to avoid API throttling
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Calculate category metrics
    categoryResults.avgConfidence /= images.length;
    const passRate = categoryResults.validationPassed / images.length;
    const expectedPassRate = EXPECTATIONS[category].validationPassRate;
    const passRateMet = passRate >= expectedPassRate;

    console.log(`\n  📊 Category Summary:`);
    console.log(`    Pass rate: ${(passRate * 100).toFixed(0)}% (expected ${(expectedPassRate * 100).toFixed(0)}%) ${passRateMet ? '✅' : '❌'}`);
    console.log(`    Avg confidence: ${categoryResults.avgConfidence.toFixed(2)}`);

    if (categoryResults.teethDetectionAccuracy.length > 0) {
      const avgAccuracy = categoryResults.teethDetectionAccuracy.reduce((a, b) => a + b, 0) / categoryResults.teethDetectionAccuracy.length;
      console.log(`    Avg teeth detection error: ±${avgAccuracy.toFixed(1)} teeth`);
    }

    results.byCategory[category] = categoryResults;
  }

  // Final summary
  console.log('\n\n📈 Overall Results:');
  console.log(`  Total images tested: ${results.total}`);
  console.log(`  Successful API calls: ${results.passed}`);
  console.log(`  Failed API calls: ${results.failed}`);
  console.log(`  API success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  // Save results to JSON
  const resultsPath = path.join(__dirname, '../test-results/ai-validation-accuracy.json');
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n  Results saved to: ${resultsPath}`);

  return results;
}

// Run test
runAccuracyTest()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
```

---

## Expected Accuracy Benchmarks

### Validation Accuracy (Frame Validation)

| Category | Expected Pass Rate | Acceptable Range |
|----------|-------------------|------------------|
| Perfect Positioning | 90% | 80-100% |
| Slight Misalignment | 70% | 60-80% |
| Wrong Angle | 10% | 0-20% (should mostly fail) |
| Blurry | 15% | 0-25% |
| No Teeth | 0% | 0-10% (should all fail) |

### Teeth Detection Accuracy (Perfect Images Only)

| Metric | Target | Acceptable |
|--------|--------|-----------|
| Tooth count accuracy | ±2 teeth | ±4 teeth |
| Quadrant accuracy | 100% | 80% |
| FDI numbering correctness | 90% | 75% |

---

## Test Execution Checklist

- [ ] Create test-dataset folder structure
- [ ] Collect 50 test images (10 per category)
- [ ] Label images correctly (left_01.jpg, front_02.jpg, etc.)
- [ ] Create test script at `scripts/test-ai-validation-accuracy.js`
- [ ] Run test script: `node scripts/test-ai-validation-accuracy.js`
- [ ] Review results in `test-results/ai-validation-accuracy.json`
- [ ] Verify benchmarks are met
- [ ] Document any failures or edge cases
- [ ] Adjust AI prompts if needed to improve accuracy
- [ ] Re-run test after prompt adjustments

---

## Common AI Failures & Solutions

### Issue 1: Tooth Count Consistently Off
**Solution:** Adjust `detectTeethInFrame()` prompt to emphasize accuracy over comprehensiveness

### Issue 2: Quadrants Incorrectly Identified
**Solution:** Add quadrant position examples in the prompt (left side = Q2+Q3)

### Issue 3: Blurry Images Passing Validation
**Solution:** Strengthen image quality check in `validateDentalFrame()` prompt

### Issue 4: Valid Images Rejected
**Solution:** Lower confidence threshold from 0.7 to 0.6 or add retry logic

---

## Success Criteria

✅ **Test Passes If:**
- Perfect positioning: ≥80% pass rate
- Slight misalignment: ≥60% pass rate
- Wrong angle/blurry/no-teeth: ≤20% pass rate
- Teeth detection: ±4 teeth accuracy on perfect images
- Quadrant detection: ≥80% correct quadrants

❌ **Test Fails If:**
- Perfect positioning: <70% pass rate
- Wrong angle images: >30% pass rate (too many false positives)
- Teeth detection: >±6 teeth error
- API errors: >5% of requests fail

---

## Cost Estimation

**Per Image Costs (Google Gemini 2.5 Flash):**
- Validation call: ~$0.0001 (small prompt + image)
- Teeth detection call: ~$0.0002 (medium prompt + image)

**Total Test Cost:**
- 50 validation calls: ~$0.005
- ~20 teeth detection calls (perfect images only): ~$0.004
- **Total: ~$0.01** (negligible)

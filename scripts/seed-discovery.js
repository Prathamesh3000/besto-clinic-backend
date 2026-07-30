'use strict';

/**
 * seed-discovery.js
 *
 * Connects to the platform MongoDB database and:
 *   1. Updates 10 clinic coordinates with real Indian city GeoJSON coordinates
 *   2. Creates ~48 FeaturedDoctor records across all 10 clinics
 *
 * Idempotent — safe to re-run. Uses findOneAndUpdate with upsert keyed on
 * { clinicSlug, name } and $setOnInsert for tenantDoctorId so IDs stay stable.
 *
 * Usage:
 *   node scripts/seed-discovery.js
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const Clinic = require('../src/models/platform/Clinic');
const FeaturedDoctor = require('../src/models/platform/FeaturedDoctor');

// ─── Clinic Coordinates (GeoJSON [longitude, latitude]) ──────────────────────

const CLINIC_COORDS = {
  'smilecare-dental':        { coordinates: [72.8777, 19.0760], city: 'Mumbai',     name: 'SmileCare Dental Clinic' },
  'healthplus-hospital':     { coordinates: [77.5946, 12.9716], city: 'Bangalore',  name: 'HealthPlus Dental Hospital' },
  'vision-eyecare':          { coordinates: [77.3910, 28.5355], city: 'Noida',      name: 'Vision Dental & Eyecare' },
  'little-angels-pediatric': { coordinates: [73.8567, 18.5204], city: 'Pune',       name: 'Little Angels Dental Care' },
  'ortholife-clinic':        { coordinates: [88.3639, 22.5726], city: 'Kolkata',    name: 'OrthoLife Dental Clinic' },
  'skin-and-you-derma':      { coordinates: [78.4867, 17.3850], city: 'Hyderabad',  name: 'Skin & You Dental Care' },
  'wellness-family-clinic':  { coordinates: [76.2673, 9.9312],  city: 'Kochi',      name: 'Wellness Family Dental' },
  'cardiocare-heart':        { coordinates: [77.4126, 23.2599], city: 'Bhopal',     name: 'CardioCare Dental Centre' },
  'neurohealth-clinic':      { coordinates: [76.7794, 30.7333], city: 'Chandigarh', name: 'NeuroHealth Dental Clinic' },
  'momcare-hospital':        { coordinates: [91.7362, 26.1445], city: 'Guwahati',   name: 'MomCare Dental Hospital' },
};

// ─── Doctor Data (~48 doctors across 10 clinics) ─────────────────────────────

const DOCTORS = [
  // ── Pune (little-angels-pediatric) — 6 doctors ────────────────────────────
  {
    clinicSlug: 'little-angels-pediatric',
    name: 'Dr. Ananya Kulkarni',
    specializations: ['General Dentistry'],
    experienceYears: 9,
    consultationFee: 600,
    averageRating: 4.7,
    totalReviews: 89,
    bio: 'Comprehensive general dental care with a gentle, patient-first approach.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Pune', year: 2014 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    clinicSlug: 'little-angels-pediatric',
    name: 'Dr. Rohit Patil',
    specializations: ['Periodontics'],
    experienceYears: 12,
    consultationFee: 900,
    averageRating: 4.6,
    totalReviews: 67,
    bio: 'Expert in gum disease treatment, implant placement, and periodontal surgery.',
    education: [
      { degree: 'BDS', institution: 'Bharati Vidyapeeth Dental College, Pune', year: 2010 },
      { degree: 'MDS Periodontics', institution: 'Government Dental College, Mumbai', year: 2013 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    clinicSlug: 'little-angels-pediatric',
    name: 'Dr. Sneha Bhosle',
    specializations: ['Orthodontics'],
    experienceYears: 8,
    consultationFee: 1200,
    averageRating: 4.8,
    totalReviews: 134,
    bio: 'Specializes in braces, aligners, and corrective jaw treatments.',
    education: [
      { degree: 'BDS', institution: 'M.A. Rangoonwala Dental College, Pune', year: 2015 },
      { degree: 'MDS Orthodontics', institution: 'SDM College of Dental Sciences, Dharwad', year: 2018 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    clinicSlug: 'little-angels-pediatric',
    name: 'Dr. Vikram Deshpande',
    specializations: ['Endodontics'],
    experienceYears: 11,
    consultationFee: 800,
    averageRating: 4.5,
    totalReviews: 56,
    bio: 'Root canal specialist with expertise in microscopic endodontic procedures.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Nagpur', year: 2011 },
      { degree: 'MDS Endodontics', institution: 'Bharati Vidyapeeth Dental College, Pune', year: 2014 },
    ],
    qualifications: ['BDS', 'MDS Endodontics'],
    languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    clinicSlug: 'little-angels-pediatric',
    name: 'Dr. Priya Chavan',
    specializations: ['Pediatric Dentistry'],
    experienceYears: 7,
    consultationFee: 500,
    averageRating: 4.9,
    totalReviews: 178,
    bio: 'Loved by kids and parents alike for gentle, anxiety-free dental care.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Pune', year: 2016 },
      { degree: 'MDS Pediatric Dentistry', institution: 'KLE Dental College, Belgaum', year: 2019 },
    ],
    qualifications: ['BDS', 'MDS Pediatric Dentistry'],
    languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    clinicSlug: 'little-angels-pediatric',
    name: 'Dr. Nikhil Joshi',
    specializations: ['Cosmetic Dentistry'],
    experienceYears: 10,
    consultationFee: 1500,
    averageRating: 4.7,
    totalReviews: 92,
    bio: 'Transforms smiles with veneers, whitening, and aesthetic restorations.',
    education: [
      { degree: 'BDS', institution: 'Bharati Vidyapeeth Dental College, Pune', year: 2013 },
      { degree: 'MDS Prosthodontics', institution: 'Government Dental College, Mumbai', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi', 'Marathi'],
  },

  // ── Mumbai (smilecare-dental) — 6 doctors ─────────────────────────────────
  {
    clinicSlug: 'smilecare-dental',
    name: 'Dr. Rajesh Sharma',
    specializations: ['General Dentistry'],
    experienceYears: 15,
    consultationFee: 700,
    averageRating: 4.6,
    totalReviews: 245,
    bio: 'Trusted family dentist with 15 years of clinical excellence in Mumbai.',
    education: [
      { degree: 'BDS', institution: 'Nair Hospital Dental College, Mumbai', year: 2008 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    clinicSlug: 'smilecare-dental',
    name: 'Dr. Aditi Mehta',
    specializations: ['Periodontics'],
    experienceYears: 10,
    consultationFee: 1000,
    averageRating: 4.8,
    totalReviews: 112,
    bio: 'Specializes in laser gum therapy and advanced periodontal treatments.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Mumbai', year: 2012 },
      { degree: 'MDS Periodontics', institution: 'Nair Hospital Dental College, Mumbai', year: 2015 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Marathi', 'Gujarati'],
  },
  {
    clinicSlug: 'smilecare-dental',
    name: 'Dr. Siddharth Patel',
    specializations: ['Orthodontics'],
    experienceYears: 9,
    consultationFee: 1400,
    averageRating: 4.7,
    totalReviews: 89,
    bio: 'Invisible aligners and lingual braces expert for adults and teens.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Mumbai', year: 2013 },
      { degree: 'MDS Orthodontics', institution: 'Manipal College of Dental Sciences', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi', 'Gujarati'],
  },
  {
    clinicSlug: 'smilecare-dental',
    name: 'Dr. Kavita Nair',
    specializations: ['Oral Surgery'],
    experienceYears: 14,
    consultationFee: 1800,
    averageRating: 4.5,
    totalReviews: 45,
    bio: 'Oral and maxillofacial surgeon handling complex extractions and implants.',
    education: [
      { degree: 'BDS', institution: 'Nair Hospital Dental College, Mumbai', year: 2008 },
      { degree: 'MDS Oral Surgery', institution: 'Government Dental College, Mumbai', year: 2011 },
    ],
    qualifications: ['BDS', 'MDS Oral Surgery'],
    languages: ['English', 'Hindi', 'Malayalam'],
  },
  {
    clinicSlug: 'smilecare-dental',
    name: 'Dr. Manish Gupta',
    specializations: ['Prosthodontics'],
    experienceYears: 11,
    consultationFee: 1100,
    averageRating: 4.6,
    totalReviews: 78,
    bio: 'Expert in crowns, bridges, dentures, and full-mouth rehabilitation.',
    education: [
      { degree: 'BDS', institution: 'Manipal College of Dental Sciences', year: 2011 },
      { degree: 'MDS Prosthodontics', institution: 'Nair Hospital Dental College, Mumbai', year: 2014 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'smilecare-dental',
    name: 'Dr. Pooja Desai',
    specializations: ['Cosmetic Dentistry'],
    experienceYears: 8,
    consultationFee: 1600,
    averageRating: 4.9,
    totalReviews: 156,
    bio: 'Creates dazzling smiles with digital smile design and porcelain veneers.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Mumbai', year: 2015 },
      { degree: 'MDS Prosthodontics', institution: 'Saveetha Dental College, Chennai', year: 2018 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi', 'Marathi'],
  },

  // ── Bangalore (healthplus-hospital) — 5 doctors ───────────────────────────
  {
    clinicSlug: 'healthplus-hospital',
    name: 'Dr. Suresh Rao',
    specializations: ['General Dentistry'],
    experienceYears: 13,
    consultationFee: 800,
    averageRating: 4.7,
    totalReviews: 198,
    bio: 'Experienced general dentist known for painless treatments and patient care.',
    education: [
      { degree: 'BDS', institution: 'SDM College of Dental Sciences, Dharwad', year: 2010 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Kannada'],
  },
  {
    clinicSlug: 'healthplus-hospital',
    name: 'Dr. Lakshmi Iyer',
    specializations: ['Orthodontics'],
    experienceYears: 8,
    consultationFee: 1300,
    averageRating: 4.8,
    totalReviews: 145,
    bio: 'Certified Invisalign provider with expertise in complex bite corrections.',
    education: [
      { degree: 'BDS', institution: 'Manipal College of Dental Sciences', year: 2015 },
      { degree: 'MDS Orthodontics', institution: 'SDM College of Dental Sciences, Dharwad', year: 2018 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi', 'Kannada', 'Tamil'],
  },
  {
    clinicSlug: 'healthplus-hospital',
    name: 'Dr. Arvind Kumar',
    specializations: ['Endodontics'],
    experienceYears: 10,
    consultationFee: 900,
    averageRating: 4.5,
    totalReviews: 67,
    bio: 'Painless root canal treatments using rotary and microscopic techniques.',
    education: [
      { degree: 'BDS', institution: 'KLE Dental College, Belgaum', year: 2013 },
      { degree: 'MDS Endodontics', institution: 'Manipal College of Dental Sciences', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Endodontics'],
    languages: ['English', 'Hindi', 'Kannada'],
  },
  {
    clinicSlug: 'healthplus-hospital',
    name: 'Dr. Meena Reddy',
    specializations: ['Periodontics'],
    experienceYears: 7,
    consultationFee: 850,
    averageRating: 4.6,
    totalReviews: 89,
    bio: 'Focused on gum health, bone grafting, and dental implant placement.',
    education: [
      { degree: 'BDS', institution: 'SDM College of Dental Sciences, Dharwad', year: 2016 },
      { degree: 'MDS Periodontics', institution: 'KLE Dental College, Belgaum', year: 2019 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Telugu', 'Kannada'],
  },
  {
    clinicSlug: 'healthplus-hospital',
    name: 'Dr. Karthik Venkatesh',
    specializations: ['Oral Surgery'],
    experienceYears: 12,
    consultationFee: 1700,
    averageRating: 4.4,
    totalReviews: 34,
    bio: 'Handles wisdom tooth removal, jaw surgery, and trauma reconstruction.',
    education: [
      { degree: 'BDS', institution: 'Manipal College of Dental Sciences', year: 2011 },
      { degree: 'MDS Oral Surgery', institution: 'Government Dental College, Mumbai', year: 2014 },
    ],
    qualifications: ['BDS', 'MDS Oral Surgery'],
    languages: ['English', 'Hindi', 'Kannada', 'Tamil'],
  },

  // ── Noida (vision-eyecare) — 4 doctors ────────────────────────────────────
  {
    clinicSlug: 'vision-eyecare',
    name: 'Dr. Amit Verma',
    specializations: ['General Dentistry'],
    experienceYears: 11,
    consultationFee: 600,
    averageRating: 4.6,
    totalReviews: 123,
    bio: 'Reliable family dentist providing preventive and restorative dental care.',
    education: [
      { degree: 'BDS', institution: 'Maulana Azad Dental College, Delhi', year: 2012 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'vision-eyecare',
    name: 'Dr. Ritu Saxena',
    specializations: ['Orthodontics'],
    experienceYears: 7,
    consultationFee: 1100,
    averageRating: 4.7,
    totalReviews: 78,
    bio: 'Passionate about creating beautiful smiles with modern orthodontic methods.',
    education: [
      { degree: 'BDS', institution: 'Maulana Azad Dental College, Delhi', year: 2016 },
      { degree: 'MDS Orthodontics', institution: 'Maulana Azad Dental College, Delhi', year: 2019 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'vision-eyecare',
    name: 'Dr. Deepak Tiwari',
    specializations: ['Prosthodontics'],
    experienceYears: 9,
    consultationFee: 1000,
    averageRating: 4.5,
    totalReviews: 45,
    bio: 'Skilled in implant-supported prosthetics and digital dentistry workflows.',
    education: [
      { degree: 'BDS', institution: 'SRM Dental College, Chennai', year: 2014 },
      { degree: 'MDS Prosthodontics', institution: 'Maulana Azad Dental College, Delhi', year: 2017 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'vision-eyecare',
    name: 'Dr. Nisha Agarwal',
    specializations: ['Cosmetic Dentistry'],
    experienceYears: 6,
    consultationFee: 1400,
    averageRating: 4.8,
    totalReviews: 56,
    bio: 'Aesthetic dentistry expert delivering natural-looking smile makeovers.',
    education: [
      { degree: 'BDS', institution: 'Maulana Azad Dental College, Delhi', year: 2017 },
      { degree: 'MDS Prosthodontics', institution: 'SRM Dental College, Chennai', year: 2020 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi'],
  },

  // ── Kolkata (ortholife-clinic) — 5 doctors ────────────────────────────────
  {
    clinicSlug: 'ortholife-clinic',
    name: 'Dr. Sourav Banerjee',
    specializations: ['General Dentistry'],
    experienceYears: 14,
    consultationFee: 500,
    averageRating: 4.7,
    totalReviews: 189,
    bio: 'Veteran dentist dedicated to affordable, high-quality oral healthcare.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kolkata', year: 2009 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Bengali'],
  },
  {
    clinicSlug: 'ortholife-clinic',
    name: 'Dr. Anindita Sen',
    specializations: ['Periodontics'],
    experienceYears: 9,
    consultationFee: 800,
    averageRating: 4.6,
    totalReviews: 67,
    bio: 'Periodontal specialist with advanced training in regenerative procedures.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kolkata', year: 2013 },
      { degree: 'MDS Periodontics', institution: 'Government Dental College, Kolkata', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Bengali'],
  },
  {
    clinicSlug: 'ortholife-clinic',
    name: 'Dr. Partha Ghosh',
    specializations: ['Orthodontics'],
    experienceYears: 11,
    consultationFee: 1200,
    averageRating: 4.8,
    totalReviews: 112,
    bio: 'Award-winning orthodontist known for efficient and aesthetic treatments.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kolkata', year: 2011 },
      { degree: 'MDS Orthodontics', institution: 'Manipal College of Dental Sciences', year: 2014 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi', 'Bengali'],
  },
  {
    clinicSlug: 'ortholife-clinic',
    name: 'Dr. Srabanti Dutta',
    specializations: ['Endodontics'],
    experienceYears: 8,
    consultationFee: 700,
    averageRating: 4.5,
    totalReviews: 45,
    bio: 'Precise and comfortable root canal treatments with modern equipment.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kolkata', year: 2014 },
      { degree: 'MDS Endodontics', institution: 'Government Dental College, Kolkata', year: 2017 },
    ],
    qualifications: ['BDS', 'MDS Endodontics'],
    languages: ['English', 'Hindi', 'Bengali'],
  },
  {
    clinicSlug: 'ortholife-clinic',
    name: 'Dr. Ranjan Das',
    specializations: ['Oral Surgery'],
    experienceYears: 16,
    consultationFee: 1500,
    averageRating: 4.4,
    totalReviews: 23,
    bio: 'Senior oral surgeon specializing in implants and corrective jaw surgery.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kolkata', year: 2006 },
      { degree: 'MDS Oral Surgery', institution: 'Government Dental College, Mumbai', year: 2009 },
    ],
    qualifications: ['BDS', 'MDS Oral Surgery'],
    languages: ['English', 'Hindi', 'Bengali'],
  },

  // ── Hyderabad (skin-and-you-derma) — 4 doctors ────────────────────────────
  {
    clinicSlug: 'skin-and-you-derma',
    name: 'Dr. Venkat Reddy',
    specializations: ['General Dentistry'],
    experienceYears: 10,
    consultationFee: 600,
    averageRating: 4.6,
    totalReviews: 145,
    bio: 'Caring general dentist focused on preventive care and patient education.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Hyderabad', year: 2013 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Telugu'],
  },
  {
    clinicSlug: 'skin-and-you-derma',
    name: 'Dr. Swathi Naidu',
    specializations: ['Orthodontics'],
    experienceYears: 6,
    consultationFee: 1100,
    averageRating: 4.7,
    totalReviews: 89,
    bio: 'Young orthodontist bringing the latest clear aligner technology to patients.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Hyderabad', year: 2017 },
      { degree: 'MDS Orthodontics', institution: 'Saveetha Dental College, Chennai', year: 2020 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi', 'Telugu'],
  },
  {
    clinicSlug: 'skin-and-you-derma',
    name: 'Dr. Prasad Rao',
    specializations: ['Endodontics'],
    experienceYears: 12,
    consultationFee: 800,
    averageRating: 4.5,
    totalReviews: 56,
    bio: 'Highly experienced endodontist for complex retreatment and microsurgery.',
    education: [
      { degree: 'BDS', institution: 'SRM Dental College, Chennai', year: 2010 },
      { degree: 'MDS Endodontics', institution: 'Government Dental College, Hyderabad', year: 2013 },
    ],
    qualifications: ['BDS', 'MDS Endodontics'],
    languages: ['English', 'Hindi', 'Telugu'],
  },
  {
    clinicSlug: 'skin-and-you-derma',
    name: 'Dr. Divya Krishna',
    specializations: ['Pediatric Dentistry'],
    experienceYears: 5,
    consultationFee: 400,
    averageRating: 4.9,
    totalReviews: 167,
    bio: 'Makes dental visits fun for children with a warm and playful approach.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Hyderabad', year: 2018 },
      { degree: 'MDS Pediatric Dentistry', institution: 'Saveetha Dental College, Chennai', year: 2021 },
    ],
    qualifications: ['BDS', 'MDS Pediatric Dentistry'],
    languages: ['English', 'Hindi', 'Telugu'],
  },

  // ── Kochi (wellness-family-clinic) — 4 doctors ────────────────────────────
  {
    clinicSlug: 'wellness-family-clinic',
    name: 'Dr. Thomas Mathew',
    specializations: ['General Dentistry'],
    experienceYears: 18,
    consultationFee: 700,
    averageRating: 4.8,
    totalReviews: 234,
    bio: 'One of Kochi\'s most experienced dentists with a loyal patient following.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kottayam', year: 2005 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Malayalam'],
  },
  {
    clinicSlug: 'wellness-family-clinic',
    name: 'Dr. Sreelakshmi Pillai',
    specializations: ['Periodontics'],
    experienceYears: 8,
    consultationFee: 900,
    averageRating: 4.6,
    totalReviews: 56,
    bio: 'Expert in minimally invasive periodontal therapy and implant dentistry.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Trivandrum', year: 2014 },
      { degree: 'MDS Periodontics', institution: 'Manipal College of Dental Sciences', year: 2017 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Malayalam'],
  },
  {
    clinicSlug: 'wellness-family-clinic',
    name: 'Dr. Arun Menon',
    specializations: ['Prosthodontics'],
    experienceYears: 10,
    consultationFee: 1000,
    averageRating: 4.5,
    totalReviews: 34,
    bio: 'Restores smiles with precision-crafted crowns, bridges, and implants.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Kottayam', year: 2013 },
      { degree: 'MDS Prosthodontics', institution: 'Government Dental College, Trivandrum', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi', 'Malayalam'],
  },
  {
    clinicSlug: 'wellness-family-clinic',
    name: 'Dr. Deepa Krishnan',
    specializations: ['Cosmetic Dentistry'],
    experienceYears: 7,
    consultationFee: 1300,
    averageRating: 4.7,
    totalReviews: 78,
    bio: 'Combines art and science for stunning cosmetic dental transformations.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Trivandrum', year: 2016 },
      { degree: 'MDS Prosthodontics', institution: 'Manipal College of Dental Sciences', year: 2019 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi', 'Malayalam'],
  },

  // ── Bhopal (cardiocare-heart) — 5 doctors ─────────────────────────────────
  {
    clinicSlug: 'cardiocare-heart',
    name: 'Dr. Ashish Mishra',
    specializations: ['General Dentistry'],
    experienceYears: 9,
    consultationFee: 500,
    averageRating: 4.6,
    totalReviews: 112,
    bio: 'Provides holistic dental care with emphasis on patient comfort.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Bhopal', year: 2014 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'cardiocare-heart',
    name: 'Dr. Sunita Shukla',
    specializations: ['Orthodontics'],
    experienceYears: 7,
    consultationFee: 1000,
    averageRating: 4.7,
    totalReviews: 67,
    bio: 'Dedicated orthodontist helping patients achieve confident, aligned smiles.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Bhopal', year: 2016 },
      { degree: 'MDS Orthodontics', institution: 'Government Dental College, Nagpur', year: 2019 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'cardiocare-heart',
    name: 'Dr. Rajeev Dubey',
    specializations: ['Oral Surgery'],
    experienceYears: 13,
    consultationFee: 1400,
    averageRating: 4.5,
    totalReviews: 34,
    bio: 'Experienced surgeon performing implants, extractions, and biopsies.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Nagpur', year: 2009 },
      { degree: 'MDS Oral Surgery', institution: 'Government Dental College, Bhopal', year: 2012 },
    ],
    qualifications: ['BDS', 'MDS Oral Surgery'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'cardiocare-heart',
    name: 'Dr. Anjali Pandey',
    specializations: ['Pediatric Dentistry'],
    experienceYears: 6,
    consultationFee: 450,
    averageRating: 4.8,
    totalReviews: 145,
    bio: 'Creates a friendly environment for children to enjoy their dental visits.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Bhopal', year: 2017 },
      { degree: 'MDS Pediatric Dentistry', institution: 'KLE Dental College, Belgaum', year: 2020 },
    ],
    qualifications: ['BDS', 'MDS Pediatric Dentistry'],
    languages: ['English', 'Hindi'],
  },
  {
    clinicSlug: 'cardiocare-heart',
    name: 'Dr. Vivek Jain',
    specializations: ['Endodontics'],
    experienceYears: 10,
    consultationFee: 750,
    averageRating: 4.4,
    totalReviews: 45,
    bio: 'Efficient and gentle root canal therapist using latest rotary systems.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Bhopal', year: 2013 },
      { degree: 'MDS Endodontics', institution: 'Government Dental College, Nagpur', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Endodontics'],
    languages: ['English', 'Hindi'],
  },

  // ── Chandigarh (neurohealth-clinic) — 4 doctors ───────────────────────────
  {
    clinicSlug: 'neurohealth-clinic',
    name: 'Dr. Harpreet Singh',
    specializations: ['General Dentistry'],
    experienceYears: 12,
    consultationFee: 650,
    averageRating: 4.7,
    totalReviews: 156,
    bio: 'Well-respected general dentist serving the Chandigarh tri-city area.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Chandigarh', year: 2011 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Punjabi'],
  },
  {
    clinicSlug: 'neurohealth-clinic',
    name: 'Dr. Simran Kaur',
    specializations: ['Periodontics'],
    experienceYears: 7,
    consultationFee: 850,
    averageRating: 4.6,
    totalReviews: 78,
    bio: 'Skilled periodontist with focus on nonsurgical gum disease management.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Chandigarh', year: 2016 },
      { degree: 'MDS Periodontics', institution: 'Government Dental College, Chandigarh', year: 2019 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Punjabi'],
  },
  {
    clinicSlug: 'neurohealth-clinic',
    name: 'Dr. Maninder Gill',
    specializations: ['Orthodontics'],
    experienceYears: 9,
    consultationFee: 1200,
    averageRating: 4.8,
    totalReviews: 98,
    bio: 'Delivers predictable orthodontic results with self-ligating brackets.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Chandigarh', year: 2014 },
      { degree: 'MDS Orthodontics', institution: 'Maulana Azad Dental College, Delhi', year: 2017 },
    ],
    qualifications: ['BDS', 'MDS Orthodontics'],
    languages: ['English', 'Hindi', 'Punjabi'],
  },
  {
    clinicSlug: 'neurohealth-clinic',
    name: 'Dr. Prabhjot Dhillon',
    specializations: ['Prosthodontics'],
    experienceYears: 8,
    consultationFee: 950,
    averageRating: 4.5,
    totalReviews: 45,
    bio: 'Focused on implant prosthodontics and full-arch rehabilitations.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Chandigarh', year: 2015 },
      { degree: 'MDS Prosthodontics', institution: 'Maulana Azad Dental College, Delhi', year: 2018 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi', 'Punjabi'],
  },

  // ── Guwahati (momcare-hospital) — 5 doctors ───────────────────────────────
  {
    clinicSlug: 'momcare-hospital',
    name: 'Dr. Pranab Bora',
    specializations: ['General Dentistry'],
    experienceYears: 11,
    consultationFee: 500,
    averageRating: 4.7,
    totalReviews: 134,
    bio: 'Trusted dental practitioner serving families across Assam for over a decade.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Guwahati', year: 2012 },
    ],
    qualifications: ['BDS'],
    languages: ['English', 'Hindi', 'Assamese'],
  },
  {
    clinicSlug: 'momcare-hospital',
    name: 'Dr. Rituparna Gogoi',
    specializations: ['Periodontics'],
    experienceYears: 8,
    consultationFee: 750,
    averageRating: 4.6,
    totalReviews: 56,
    bio: 'Periodontal specialist offering laser-assisted gum treatments.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Guwahati', year: 2015 },
      { degree: 'MDS Periodontics', institution: 'Manipal College of Dental Sciences', year: 2018 },
    ],
    qualifications: ['BDS', 'MDS Periodontics'],
    languages: ['English', 'Hindi', 'Assamese'],
  },
  {
    clinicSlug: 'momcare-hospital',
    name: 'Dr. Hemanta Kalita',
    specializations: ['Endodontics'],
    experienceYears: 10,
    consultationFee: 700,
    averageRating: 4.5,
    totalReviews: 45,
    bio: 'Meticulous endodontist ensuring long-lasting root canal treatment outcomes.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Guwahati', year: 2013 },
      { degree: 'MDS Endodontics', institution: 'Government Dental College, Kolkata', year: 2016 },
    ],
    qualifications: ['BDS', 'MDS Endodontics'],
    languages: ['English', 'Hindi', 'Assamese'],
  },
  {
    clinicSlug: 'momcare-hospital',
    name: 'Dr. Nandini Das',
    specializations: ['Cosmetic Dentistry'],
    experienceYears: 6,
    consultationFee: 1100,
    averageRating: 4.8,
    totalReviews: 89,
    bio: 'Bringing modern cosmetic dental solutions to Northeast India.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Guwahati', year: 2017 },
      { degree: 'MDS Prosthodontics', institution: 'Saveetha Dental College, Chennai', year: 2020 },
    ],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    languages: ['English', 'Hindi', 'Assamese', 'Bengali'],
  },
  {
    clinicSlug: 'momcare-hospital',
    name: 'Dr. Bikash Hazarika',
    specializations: ['Oral Surgery'],
    experienceYears: 14,
    consultationFee: 1300,
    averageRating: 4.4,
    totalReviews: 23,
    bio: 'Experienced oral surgeon handling trauma cases and complex extractions.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Guwahati', year: 2009 },
      { degree: 'MDS Oral Surgery', institution: 'Government Dental College, Kolkata', year: 2012 },
    ],
    qualifications: ['BDS', 'MDS Oral Surgery'],
    languages: ['English', 'Hindi', 'Assamese'],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to platform DB...');
  await mongoose.connect(env.PLATFORM_DB_URI);
  console.log('Connected.\n');

  // ── Step 1: Update clinic coordinates ──────────────────────────────────────

  console.log('--- Step 1: Updating clinic coordinates ---');
  let clinicsUpdated = 0;

  for (const [slug, { coordinates, city }] of Object.entries(CLINIC_COORDS)) {
    const result = await Clinic.findOneAndUpdate(
      { slug, deletedAt: null },
      {
        $set: {
          location: { type: 'Point', coordinates },
          'address.city': city,
        },
      },
      { new: true },
    );

    if (result) {
      clinicsUpdated++;
      console.log(`  [OK] ${slug} -> ${city} [${coordinates}]`);
    } else {
      console.log(`  [SKIP] ${slug} -- clinic not found`);
    }
  }

  console.log(`\nClinics updated: ${clinicsUpdated}/${Object.keys(CLINIC_COORDS).length}\n`);

  // ── Step 2: Upsert FeaturedDoctor records ──────────────────────────────────

  console.log('--- Step 2: Upserting FeaturedDoctor records ---');
  let doctorsUpserted = 0;
  let doctorsSkipped = 0;

  // Build a slug -> clinic lookup for clinicId, clinicName, clinicLogo, clinicCity
  const slugs = [...new Set(DOCTORS.map((d) => d.clinicSlug))];
  const clinics = await Clinic.find({ slug: { $in: slugs }, deletedAt: null });
  const clinicMap = {};
  for (const c of clinics) {
    clinicMap[c.slug] = c;
  }

  for (const doc of DOCTORS) {
    const clinic = clinicMap[doc.clinicSlug];
    const coords = CLINIC_COORDS[doc.clinicSlug];

    // Use real clinic data if available, otherwise fall back to CLINIC_COORDS metadata
    const clinicId = clinic ? clinic._id : new mongoose.Types.ObjectId();
    const clinicName = clinic ? clinic.name : (coords.name || doc.clinicSlug);
    const clinicLogo = clinic ? (clinic.logo || '') : '';

    await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug: doc.clinicSlug, name: doc.name },
      {
        $set: {
          clinicId,
          clinicName,
          clinicLogo,
          clinicCity: coords.city,
          location: { type: 'Point', coordinates: coords.coordinates },
          avatar: '',
          specializations: doc.specializations,
          bio: doc.bio,
          education: doc.education,
          experienceYears: doc.experienceYears,
          qualifications: doc.qualifications,
          languages: doc.languages,
          consultationFee: doc.consultationFee,
          acceptingNewPatients: true,
          averageRating: doc.averageRating,
          totalReviews: doc.totalReviews,
          isActive: true,
          publishedAt: new Date(),
          deletedAt: null,
        },
        $setOnInsert: {
          tenantDoctorId: new mongoose.Types.ObjectId().toString(),
        },
      },
      { upsert: true, new: true },
    );

    doctorsUpserted++;
    const tag = clinic ? 'OK' : 'OK*';
    console.log(`  [${tag}] ${doc.name} (${doc.specializations.join(', ')}) -> ${doc.clinicSlug}`);
  }

  console.log(`\nDoctors upserted: ${doctorsUpserted}, skipped: ${doctorsSkipped}`);
  console.log(`Total doctor records processed: ${doctorsUpserted}\n`);

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalDoctors = await FeaturedDoctor.countDocuments({ deletedAt: null });

  const slugCounts = {};
  for (const doc of DOCTORS) {
    slugCounts[doc.clinicSlug] = (slugCounts[doc.clinicSlug] || 0) + 1;
  }

  console.log('=== SEED DISCOVERY COMPLETE ===');
  console.log(`  Clinics with coordinates: ${clinicsUpdated}`);
  console.log(`  Doctors upserted this run: ${doctorsUpserted}`);
  console.log(`  Total FeaturedDoctor docs in DB: ${totalDoctors}`);
  console.log('');
  console.log('  Per-clinic breakdown:');
  for (const [slug, count] of Object.entries(slugCounts)) {
    const city = CLINIC_COORDS[slug]?.city || '??';
    console.log(`    ${slug} (${city}): ${count} doctors`);
  }
  console.log('===============================\n');

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('SEED ERROR:', err);
  process.exit(1);
});

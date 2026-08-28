#!/usr/bin/env python3
"""Verify seeded data in the BestoClinic platform database."""

import os
import sys
from pymongo import MongoClient
from datetime import datetime

# Read from the environment rather than hardcoding. This previously held a live
# Atlas username and password in plain text, which would have been published the
# moment this repository was pushed.
PLATFORM_URI = os.environ.get("PLATFORM_DB_URI")
if not PLATFORM_URI:
    sys.exit(
        "PLATFORM_DB_URI is not set. Load it from .env before running, e.g.: "
        "PLATFORM_DB_URI=$(grep ^PLATFORM_DB_URI .env | cut -d= -f2-) "
        "python scripts/verify_seeded_data.py"
    )

def separator(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print('='*70)

def main():
    print("Connecting to platform DB...")
    client = MongoClient(PLATFORM_URI)
    db = client["besto_clinic"]
    print("Connected!\n")

    # ================================================================
    # 1. PLATFORM USERS
    # ================================================================
    separator("PLATFORM USERS")
    platform_users = list(db.platformusers.find({}, {"name": 1, "email": 1, "role": 1, "createdAt": 1}))
    if platform_users:
        print(f"  Found {len(platform_users)} platform user(s):\n")
        print(f"  {'Name':<30} {'Email':<35} {'Role':<15}")
        print(f"  {'-'*30} {'-'*35} {'-'*15}")
        for u in platform_users:
            print(f"  {u.get('name','N/A'):<30} {u.get('email','N/A'):<35} {u.get('role','N/A'):<15}")
    else:
        print("  NO platform users found!")

    # ================================================================
    # 2. PLANS
    # ================================================================
    separator("SUBSCRIPTION PLANS")
    plans = list(db.plans.find({}, {"name": 1, "slug": 1, "tier": 1, "pricing": 1, "isActive": 1, "features": 1}).sort("tier", 1))
    if plans:
        print(f"  Found {len(plans)} plan(s):\n")
        print(f"  {'Name':<20} {'Slug':<18} {'Tier':<6} {'Monthly':<10} {'Doctors':<8} {'Staff':<8} {'Active':<8}")
        print(f"  {'-'*20} {'-'*18} {'-'*6} {'-'*10} {'-'*8} {'-'*8} {'-'*8}")
        for p in plans:
            pricing = p.get('pricing', {})
            features = p.get('features', {})
            print(f"  {p.get('name','N/A'):<20} {p.get('slug','N/A'):<18} {p.get('tier','?'):<6} "
                  f"Rs.{pricing.get('monthly',0):<7} {features.get('maxDoctors','?'):<8} "
                  f"{features.get('maxStaff','?'):<8} {str(p.get('isActive','?')):<8}")
    else:
        print("  NO plans found!")

    # ================================================================
    # 3. CLINICS
    # ================================================================
    separator("CLINICS (TENANTS)")
    clinics = list(db.clinics.find(
        {"deletedAt": None},
        {"name": 1, "slug": 1, "email": 1, "status": 1, "subscription": 1, "superAdmin": 1,
         "address": 1, "usage": 1, "activatedAt": 1}
    ).sort("name", 1))

    if clinics:
        print(f"  Found {len(clinics)} clinic(s):\n")
        for i, c in enumerate(clinics, 1):
            sub = c.get('subscription', {})
            addr = c.get('address', {})
            usage = c.get('usage', {})
            sa = c.get('superAdmin', {})

            print(f"  {i}. {c.get('name', 'N/A')}")
            print(f"     Slug:         {c.get('slug', 'N/A')}")
            print(f"     Email:        {c.get('email', 'N/A')}")
            print(f"     Status:       {c.get('status', 'N/A')}")
            print(f"     Plan:         {sub.get('plan', 'N/A')} ({sub.get('status', 'N/A')})")
            print(f"     City:         {addr.get('city', 'N/A')}, {addr.get('state', 'N/A')}")
            if sa:
                print(f"     SuperAdmin:   {sa.get('email', 'N/A')}")
            if usage:
                print(f"     Usage:        {usage.get('doctorsCount', '?')} doctors, "
                      f"{usage.get('staffCount', '?')} staff, "
                      f"{usage.get('patientsCount', '?')} patients")
            print()
    else:
        print("  NO clinics found!")

    # ================================================================
    # 4. CHECK TENANT DATABASES (users in each tenant)
    # ================================================================
    separator("TENANT DATABASE USERS")

    for c in clinics:
        slug = c.get('slug', '')
        db_name = f"bestoclinic_{slug.replace('-', '_')}"

        try:
            tenant_db = client[db_name]
            # Check if DB exists by listing collections
            collections = tenant_db.list_collection_names()

            if not collections:
                print(f"\n  {c.get('name')} ({slug}): Empty DB (no collections)")
                continue

            users = list(tenant_db.users.find(
                {},
                {"name": 1, "email": 1, "role": 1, "isActive": 1, "phone": 1}
            ))

            patients = tenant_db.patients.count_documents({})
            appointments = tenant_db.appointments.count_documents({}) if 'appointments' in collections else 0
            invoices = tenant_db.invoices.count_documents({}) if 'invoices' in collections else 0

            print(f"\n  {c.get('name')} ({slug})")
            print(f"    DB: {db_name}")
            print(f"    Collections: {len(collections)} ({', '.join(sorted(collections)[:10])}{'...' if len(collections) > 10 else ''})")
            print(f"    Stats: {len(users)} users, {patients} patients, {appointments} appointments, {invoices} invoices")

            if users:
                print(f"\n    {'Name':<25} {'Email':<40} {'Role':<15} {'Active':<8}")
                print(f"    {'-'*25} {'-'*40} {'-'*15} {'-'*8}")
                for u in users:
                    print(f"    {str(u.get('name','N/A')):<25} {str(u.get('email','N/A')):<40} "
                          f"{str(u.get('role','N/A')):<15} {str(u.get('isActive','?')):<8}")
            else:
                print(f"    No users found in tenant DB")

        except Exception as e:
            print(f"\n  {c.get('name')} ({slug}): Error - {e}")

    # ================================================================
    # 5. OTHER PLATFORM COLLECTIONS
    # ================================================================
    separator("OTHER PLATFORM COLLECTIONS")
    all_collections = db.list_collection_names()
    print(f"  Platform DB collections ({len(all_collections)}):")
    for col in sorted(all_collections):
        count = db[col].count_documents({})
        print(f"    - {col}: {count} document(s)")

    # ================================================================
    # SUMMARY
    # ================================================================
    separator("VERIFICATION SUMMARY")
    print(f"  Platform Users:    {len(platform_users)}")
    print(f"  Subscription Plans: {len(plans)}")
    print(f"  Clinics (Tenants):  {len(clinics)}")

    issues = []
    if len(platform_users) == 0:
        issues.append("No platform admin user found")
    if len(plans) == 0:
        issues.append("No subscription plans found")
    if len(clinics) == 0:
        issues.append("No clinics found")

    # Check expected data
    admin_exists = any(u.get('email') == 'admin@bestoclinic.com' for u in platform_users)
    if not admin_exists:
        issues.append("Platform admin (admin@bestoclinic.com) NOT found")

    expected_plans = {'free', 'starter', 'professional', 'enterprise'}
    found_plans = {p.get('slug') for p in plans}
    missing_plans = expected_plans - found_plans
    if missing_plans:
        issues.append(f"Missing plans: {', '.join(missing_plans)}")

    expected_clinics = {'smilecare-dental', 'healthplus-hospital', 'demo-clinic'}
    found_clinics = {c.get('slug') for c in clinics}
    missing_clinics = expected_clinics - found_clinics
    if missing_clinics:
        issues.append(f"Missing clinics: {', '.join(missing_clinics)}")

    if issues:
        print(f"\n  ISSUES FOUND ({len(issues)}):")
        for issue in issues:
            print(f"    - {issue}")
    else:
        print(f"\n  ALL CHECKS PASSED!")

    print(f"\n{'='*70}\n")
    client.close()


if __name__ == '__main__':
    main()

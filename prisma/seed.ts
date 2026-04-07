import prisma from '../src/config/prisma';
import bcrypt from 'bcrypt';

async function main() {
    console.log('🌱 Starting database seed...\n');

    // ── 1. Diseases ──────────────────────────────────────────────────
    const diseases = await Promise.all([
        prisma.disease.upsert({
            where: { name: 'Diabetes Mellitus Type 2' },
            update: {},
            create: { name: 'Diabetes Mellitus Type 2', type: 'CHRONIC', description: 'A chronic condition affecting blood sugar regulation' },
        }),
        prisma.disease.upsert({
            where: { name: 'Hypertension' },
            update: {},
            create: { name: 'Hypertension', type: 'CHRONIC', description: 'Persistently elevated arterial blood pressure' },
        }),
        prisma.disease.upsert({
            where: { name: 'Asthma' },
            update: {},
            create: { name: 'Asthma', type: 'CHRONIC', description: 'Chronic inflammatory disease of the airways' },
        }),
        prisma.disease.upsert({
            where: { name: 'Pneumonia' },
            update: {},
            create: { name: 'Pneumonia', type: 'ACUTE', description: 'Infection of the lungs causing inflammation in the air sacs' },
        }),
        prisma.disease.upsert({
            where: { name: 'Dengue Fever' },
            update: {},
            create: { name: 'Dengue Fever', type: 'ACUTE', description: 'Mosquito-borne viral infection causing high fever' },
        }),
        prisma.disease.upsert({
            where: { name: 'Migraine' },
            update: {},
            create: { name: 'Migraine', type: 'CHRONIC', description: 'Recurring headaches of moderate to severe intensity' },
        }),
    ]);

    console.log(`✅ Seeded ${diseases.length} diseases`);

    // ── 2. Medicines ─────────────────────────────────────────────────
    const medicines = await Promise.all([
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Glucophage', genericName: 'Metformin', manufacturer: 'Merck', dosageStrength: '500mg', dosageForm: 'TABLET' } },
            update: {},
            create: { brandName: 'Glucophage', genericName: 'Metformin', dosageForm: 'TABLET', dosageStrength: '500mg', manufacturer: 'Merck' },
        }),
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Amlodac', genericName: 'Amlodipine', manufacturer: 'Zydus', dosageStrength: '5mg', dosageForm: 'TABLET' } },
            update: {},
            create: { brandName: 'Amlodac', genericName: 'Amlodipine', dosageForm: 'TABLET', dosageStrength: '5mg', manufacturer: 'Zydus' },
        }),
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Asthalin', genericName: 'Salbutamol', manufacturer: 'Cipla', dosageStrength: '100mcg', dosageForm: 'INHALER' } },
            update: {},
            create: { brandName: 'Asthalin', genericName: 'Salbutamol', dosageForm: 'INHALER', dosageStrength: '100mcg', manufacturer: 'Cipla' },
        }),
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Augmentin', genericName: 'Amoxicillin/Clavulanate', manufacturer: 'GSK', dosageStrength: '625mg', dosageForm: 'TABLET' } },
            update: {},
            create: { brandName: 'Augmentin', genericName: 'Amoxicillin/Clavulanate', dosageForm: 'TABLET', dosageStrength: '625mg', manufacturer: 'GSK' },
        }),
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Crocin', genericName: 'Paracetamol', manufacturer: 'GSK', dosageStrength: '500mg', dosageForm: 'TABLET' } },
            update: {},
            create: { brandName: 'Crocin', genericName: 'Paracetamol', dosageForm: 'TABLET', dosageStrength: '500mg', manufacturer: 'GSK' },
        }),
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Pan-D', genericName: 'Pantoprazole/Domperidone', manufacturer: 'Alkem', dosageStrength: '40mg', dosageForm: 'CAPSULE' } },
            update: {},
            create: { brandName: 'Pan-D', genericName: 'Pantoprazole/Domperidone', dosageForm: 'CAPSULE', dosageStrength: '40mg', manufacturer: 'Alkem' },
        }),
        prisma.medicine.upsert({
            where: { brandName_genericName_manufacturer_dosageStrength_dosageForm: { brandName: 'Benadryl', genericName: 'Diphenhydramine', manufacturer: 'Johnson & Johnson', dosageStrength: '100ml', dosageForm: 'SYRUP' } },
            update: {},
            create: { brandName: 'Benadryl', genericName: 'Diphenhydramine', dosageForm: 'SYRUP', dosageStrength: '100ml', manufacturer: 'Johnson & Johnson' },
        }),
    ]);

    console.log(`✅ Seeded ${medicines.length} medicines`);

    // ── 3. Hospitals ─────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash('Hospital@123', 10);

    const hospitals = await Promise.all([
        prisma.hospital.upsert({
            where: { userId: 'apollo_delhi' },
            update: {},
            create: {
                name: 'Apollo Hospital Delhi',
                helplineNumber: '011-26825000',
                address: 'Sarita Vihar, Delhi Mathura Road, New Delhi - 110076',
                userId: 'apollo_delhi',
                password: hashedPassword,
            },
        }),
        prisma.hospital.upsert({
            where: { userId: 'aiims_delhi' },
            update: {},
            create: {
                name: 'AIIMS New Delhi',
                helplineNumber: '011-26588500',
                address: 'Sri Aurobindo Marg, Ansari Nagar, New Delhi - 110029',
                userId: 'aiims_delhi',
                password: hashedPassword,
            },
        }),
        prisma.hospital.upsert({
            where: { userId: 'fortis_gurgaon' },
            update: {},
            create: {
                name: 'Fortis Memorial Research Institute',
                helplineNumber: '0124-4962200',
                address: 'Sector 44, Gurugram, Haryana - 122002',
                userId: 'fortis_gurgaon',
                password: hashedPassword,
            },
        }),
    ]);

    console.log(`✅ Seeded ${hospitals.length} hospitals`);

    // ── 4. Doctors ───────────────────────────────────────────────────
    const doctors = await Promise.all([
        prisma.doctor.upsert({
            where: { username: 'dr.sharma' },
            update: {},
            create: { name: 'Dr. Rajesh Sharma', username: 'dr.sharma', hospitalId: hospitals[0].id },
        }),
        prisma.doctor.upsert({
            where: { username: 'dr.patel' },
            update: {},
            create: { name: 'Dr. Priya Patel', username: 'dr.patel', hospitalId: hospitals[0].id },
        }),
        prisma.doctor.upsert({
            where: { username: 'dr.gupta' },
            update: {},
            create: { name: 'Dr. Ankit Gupta', username: 'dr.gupta', hospitalId: hospitals[1].id },
        }),
        prisma.doctor.upsert({
            where: { username: 'dr.singh' },
            update: {},
            create: { name: 'Dr. Manpreet Singh', username: 'dr.singh', hospitalId: hospitals[2].id },
        }),
    ]);

    console.log(`✅ Seeded ${doctors.length} doctors`);

    // ── 5. Patients ──────────────────────────────────────────────────
    const patients = await Promise.all([
        prisma.patient.upsert({
            where: { mobileNumber: '9876543210' },
            update: {},
            create: {
                name: 'Amit Kumar',
                dateOfBirth: new Date('1985-06-15'),
                bloodGroup: 'B+',
                gender: 'MALE',
                mobileNumber: '9876543210',
            },
        }),
        prisma.patient.upsert({
            where: { mobileNumber: '9876543211' },
            update: {},
            create: {
                name: 'Sunita Devi',
                dateOfBirth: new Date('1992-03-22'),
                bloodGroup: 'O+',
                gender: 'FEMALE',
                mobileNumber: '9876543211',
            },
        }),
        prisma.patient.upsert({
            where: { mobileNumber: '9876543212' },
            update: {},
            create: {
                name: 'Rahul Verma',
                dateOfBirth: new Date('1978-11-08'),
                bloodGroup: 'A-',
                gender: 'MALE',
                mobileNumber: '9876543212',
            },
        }),
        prisma.patient.upsert({
            where: { mobileNumber: '9876543213' },
            update: {},
            create: {
                name: 'Meera Joshi',
                dateOfBirth: new Date('2000-01-30'),
                bloodGroup: 'AB+',
                gender: 'FEMALE',
                mobileNumber: '9876543213',
            },
        }),
    ]);

    console.log(`✅ Seeded ${patients.length} patients`);

    // ── 6. Medical History ───────────────────────────────────────────
    await prisma.medicalHistory.createMany({
        data: [
            { diseaseId: diseases[0].id, patientId: patients[0].id, description: 'Diagnosed during routine check-up', startDate: new Date('2020-03-10') },
            { diseaseId: diseases[1].id, patientId: patients[0].id, description: 'Family history of hypertension', startDate: new Date('2021-07-01') },
            { diseaseId: diseases[2].id, patientId: patients[1].id, description: 'Childhood onset asthma', startDate: new Date('2005-01-15'), endDate: new Date('2018-06-01') },
            { diseaseId: diseases[3].id, patientId: patients[2].id, description: 'Severe pneumonia post monsoon', startDate: new Date('2023-09-05'), endDate: new Date('2023-10-20') },
            { diseaseId: diseases[5].id, patientId: patients[3].id, description: 'Chronic migraines with aura', startDate: new Date('2022-04-12') },
        ],
        skipDuplicates: true,
    });

    console.log('✅ Seeded medical histories');

    // ── 7. Patient Conditions ────────────────────────────────────────
    const conditions = await Promise.all([
        prisma.patientCondition.create({
            data: {
                patientId: patients[0].id,
                diseaseId: diseases[0].id,
                status: 'STABLE',
                startDate: new Date('2024-01-15'),
                hospitalId: hospitals[0].id,
                doctorId: doctors[0].id,
            },
        }),
        prisma.patientCondition.create({
            data: {
                patientId: patients[1].id,
                diseaseId: diseases[2].id,
                status: 'STABLE',
                startDate: new Date('2024-02-10'),
                hospitalId: hospitals[0].id,
                doctorId: doctors[1].id,
            },
        }),
        prisma.patientCondition.create({
            data: {
                patientId: patients[2].id,
                diseaseId: diseases[3].id,
                status: 'CRITICAL',
                startDate: new Date('2024-03-01'),
                hospitalId: hospitals[1].id,
                doctorId: doctors[2].id,
            },
        }),
        prisma.patientCondition.create({
            data: {
                patientId: patients[3].id,
                diseaseId: diseases[4].id,
                status: 'RECOVERED',
                startDate: new Date('2024-01-20'),
                endDate: new Date('2024-02-15'),
                hospitalId: hospitals[2].id,
                doctorId: doctors[3].id,
            },
        }),
    ]);

    console.log(`✅ Seeded ${conditions.length} patient conditions`);

    // ── 8. Medicine Allotments ───────────────────────────────────────
    const allotments = await Promise.all([
        prisma.medicineAllotted.create({
            data: {
                patientConditionId: conditions[0].id,
                medicineId: medicines[0].id, // Metformin for diabetes
                quantity: 2,
                tillDate: new Date('2025-01-15'),
            },
        }),
        prisma.medicineAllotted.create({
            data: {
                patientConditionId: conditions[1].id,
                medicineId: medicines[2].id, // Salbutamol inhaler for asthma
                quantity: 1,
                tillDate: new Date('2025-02-10'),
            },
        }),
        prisma.medicineAllotted.create({
            data: {
                patientConditionId: conditions[2].id,
                medicineId: medicines[3].id, // Augmentin for pneumonia
                quantity: 3,
                tillDate: new Date('2024-04-01'),
            },
        }),
        prisma.medicineAllotted.create({
            data: {
                patientConditionId: conditions[2].id,
                medicineId: medicines[4].id, // Paracetamol for pneumonia fever
                quantity: 2,
                tillDate: new Date('2024-04-01'),
            },
        }),
    ]);

    console.log(`✅ Seeded ${allotments.length} medicine allotments`);

    // ── 9. Medicine Timings ──────────────────────────────────────────
    // Helper: creates a time-only Date (Prisma @db.Time)
    const time = (h: number, m: number) => new Date(`1970-01-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

    await prisma.medicineTimings.createMany({
        data: [
            { medicineAllottedId: allotments[0].id, timing: time(8, 0) },   // Metformin – morning
            { medicineAllottedId: allotments[0].id, timing: time(20, 0) },  // Metformin – night
            { medicineAllottedId: allotments[1].id, timing: time(7, 0) },   // Inhaler – morning
            { medicineAllottedId: allotments[2].id, timing: time(8, 0) },   // Augmentin – morning
            { medicineAllottedId: allotments[2].id, timing: time(14, 0) },  // Augmentin – afternoon
            { medicineAllottedId: allotments[2].id, timing: time(21, 0) },  // Augmentin – night
            { medicineAllottedId: allotments[3].id, timing: time(10, 0) },  // Paracetamol – morning
            { medicineAllottedId: allotments[3].id, timing: time(22, 0) },  // Paracetamol – night
        ],
    });

    console.log('✅ Seeded medicine timings');

    // ── 10. Patient Progress ─────────────────────────────────────────
    await prisma.patientProgress.createMany({
        data: [
            {
                patientConditionId: conditions[0].id,
                description: 'Blood sugar levels stabilising with medication',
                followUpStatus: 'SUCCESSFUL',
                scheduledDate: new Date('2024-02-15'),
                percentageRecovery: 40,
                questions: 'Are you following the prescribed diet?',
                answer: 'Yes, mostly following the low-sugar diet.',
            },
            {
                patientConditionId: conditions[0].id,
                description: 'HbA1c improved from 9.2 to 7.5',
                followUpStatus: 'SUCCESSFUL',
                scheduledDate: new Date('2024-04-15'),
                percentageRecovery: 60,
                questions: 'Any episodes of hypoglycemia?',
                answer: 'One mild episode last week.',
            },
            {
                patientConditionId: conditions[1].id,
                description: 'Inhaler usage reduced, fewer wheezing episodes',
                followUpStatus: 'SUCCESSFUL',
                scheduledDate: new Date('2024-03-10'),
                percentageRecovery: 55,
            },
            {
                patientConditionId: conditions[2].id,
                description: 'Patient admitted, oxygen saturation low',
                followUpStatus: 'SCHEDULED',
                scheduledDate: new Date('2024-03-15'),
                percentageRecovery: 10,
            },
            {
                patientConditionId: conditions[2].id,
                description: 'Responding to antibiotics, vitals improving',
                followUpStatus: 'SUCCESSFUL',
                scheduledDate: new Date('2024-03-22'),
                percentageRecovery: 35,
                questions: 'How is your breathing now?',
                answer: 'Much better, no chest pain.',
            },
            {
                patientConditionId: conditions[3].id,
                description: 'Dengue fever fully resolved, platelet count normal',
                followUpStatus: 'SUCCESSFUL',
                scheduledDate: new Date('2024-02-15'),
                percentageRecovery: 100,
            },
        ],
    });

    console.log('✅ Seeded patient progress records');

    console.log('\n🎉 Database seeding complete!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

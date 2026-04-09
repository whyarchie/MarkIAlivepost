import admin from 'firebase-admin'
import { AppError } from './AppError';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = path.join(process.cwd(), 'alivepost.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

export async function PushNotification({ fcmToken, title, body }: { fcmToken: string; title: string; body: string; }, extraData: { type: string; id: number; }) {
    try {
        const response = await admin.messaging().send({
            token: fcmToken,
            notification: {
                title: title,
                body: body
            },
            data: {
                type: extraData.type,
                id: String(extraData.id)
            }
        })
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
        throw new AppError('Fail to send notification', 500)
    }
}
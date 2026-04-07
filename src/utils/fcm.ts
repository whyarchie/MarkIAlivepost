import admin from 'firebase-admin'
import { AppError } from './AppError';
admin.initializeApp({
  credential: admin.credential.cert(require("../../alivepost.json"))
});

export async function PushNotification({fcmToken, title , body}:{fcmToken: string , title: string ,  body: string}){
try {
    await admin.messaging().send({
        token: fcmToken,
        notification:{
            title: title,
            body: body
        },
        data:{
            type: "FOLLOW_UP"
        }
    })
} catch (error) {
    throw new AppError('Fail to send notification',500)
}
}
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

//Testing Credentials...
var transporter = nodemailer.createTransport({
  name: "AnyJob",
  service: "gmail",
  auth: {
    user: "miltonbaker.psoriatic@gmail.com",
    pass: "vjmxuslfvothtzqd",
  },
  socketTimeout: 5000000,
});

export const sendMail = async (to: string, subject: string, html?: string) => {
  try {
    const info = await transporter.sendMail({
      from: `AnyJob <miltonbaker.psoriatic@gmail.com>`,
      to,
      subject,
      html, //const html = `Dear ${savedUser.firstName} ${savedUser.lastName}, your login credentials for AnyJob are: <b>Password: ${generatedPass}</b> or you can directly log in using your registered <b>Phone Number: ${savedUser.phone}</b>.`;
    });

    console.log("Message sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

//contact us
export const sendMailToAdmin = async (
  from: string,
  senderName: string,
  html?: string
) => {
  try {
    const info = await transporter.sendMail({
      from: `${senderName}<${from}>`,
      to: "info@anyjob.com",
      subject: `New Message from ${senderName}`,
      html,
    });

    console.log("Message sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

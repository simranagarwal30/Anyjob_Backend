import mongoose from "mongoose";
import { DBInfo } from "../../types/commonType";

// const connectDB = async (): Promise<void> => {
//   try {
//     const connectionInstance = await mongoose.connect(
//       `${process.env.MONGODB_URI}/${DB_NAME}`
//     );
//     //current date and time
//     const currentDate = new Date().toLocaleString();
//     const dbInfo: DBInfo = {
//       STATUS: "Connected",
//       HOST: connectionInstance.connection.host,
//       DATE_TIME: currentDate,
//     };
//     console.log("\n🛢  MongoDB Connection Established");
//     console.table(dbInfo);
//   } catch (error) {
//     console.log("MongoDB Connection Error", error);
//     process.exit(1);
//   }
// };

const connectDB = async (): Promise<void> => {
  try {
    const isProd = process.env.NODE_ENV === "production";

    const mongoUri = isProd
      ? process.env.MONGODB_URI_PROD
      : process.env.MONGODB_URI_DEV;

    const DB_NAME = isProd
      ? "anyjob"
      : "anyjob_dev";


    const connectionInstance = await mongoose.connect(
      `${mongoUri}/${DB_NAME}`
    );

    const dbInfo: DBInfo = {
      STATUS: "Connected",
      HOST: connectionInstance.connection.host,
      ENV: isProd ? "Production" : "Development",
      DATE_TIME: new Date().toLocaleString(),
    };

    console.log("\n🛢  MongoDB Connection Established");
    console.table(dbInfo);

  } catch (error) {
    console.log("MongoDB Connection Error", error);
    process.exit(1);
  }
};

export default connectDB;


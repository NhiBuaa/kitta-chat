// CHECKSUM
import SparkMD5 from 'spark-md5';

export const calculatedMD5 = (file) => {
    return new Promise((resolve) => {
        const fileReader = new FileReader();
        const spark = new SparkMD5.ArrayBuffer();

        fileReader.onload = (e) => {
            spark.append(e.target.result);
            resolve(spark.end());
        }
        fileReader.readAsArrayBuffer(file);
    })
}
import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp"; // Import the sharp library

import { pipeline } from "stream/promises";
import { promisify } from "util";

const asyncPipeline = promisify(pipeline);

const MAX_WIDTH = 200;
const MAX_HEIGHT = 200;
const DDB_TABLE = "ContentTable";

const s3Client = new S3Client({
  region: "ap-south-1",
});
const dynamoDbClient = new DynamoDBClient({
  region: "ap-south-1",
});

const startsWith = (text: string, prefix: string) => text.startsWith(prefix);

exports.handler = async (event: any): Promise<void> => {
  try {
    console.log(
      "Reading options from event:\n",
      JSON.stringify(event, null, 2)
    );
    const title = event.title || "";
    const description = event.description || "";
    const isPublic = event.isPublic || false;
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey = decodeURIComponent(event.Records[0].s3.object.key);
    const eventName = event.Records[0].eventName;
    const eventTime = event.Records[0].eventTime;
    const dstBucket = srcBucket;
    const dstKey = srcKey.replace(/content/, "thumbnails");
    const identityId = srcKey?.match(/.*\/content\/([^\/]*)/)?.[1] || "";

    console.log("Bucket Name = " + srcBucket);
    console.log("eventName = " + eventName);
    console.log("dstKey = " + dstKey);
    console.log("identityId = " + identityId);

    if (startsWith(eventName, "ObjectRemoved")) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: dstBucket,
          Key: dstKey,
        })
      );

      await dynamoDbClient.send(
        new DeleteItemCommand({
          TableName: DDB_TABLE,
          Key: {
            identityId: { S: identityId },
            objectKey: { S: srcKey },
          },
        })
      );
    } else {
      const typeMatch = srcKey.match(/\.([^.]*)$/);
      if (!typeMatch) {
        throw new Error(`Unable to infer image type for key ${srcKey}`);
      }

      const imageType = typeMatch[1];
      if (imageType !== "jpg" && imageType !== "png" && imageType !== "gif") {
        throw new Error(`Skipping non-image ${srcKey}`);
      }

      const response: GetObjectCommandOutput = await s3Client.send(
        new GetObjectCommand({
          Bucket: srcBucket,
          Key: srcKey,
        })
      );
      const result = await response.Body?.transformToByteArray();

      const size = await sharp(result).metadata();

      const scalingFactor = Math.min(
        MAX_WIDTH / size.width!,
        MAX_HEIGHT / size.height!
      );

      // Ensure positive integer values for width and height
      const width = Math.floor(scalingFactor * size.width!);
      const height = Math.floor(scalingFactor * size.height!);

      const transformedImage = await sharp(result)
        .resize(width, height)
        .toBuffer();

      await s3Client.send(
        new PutObjectCommand({
          Bucket: dstBucket,
          Key: dstKey,
          Body: transformedImage,
          ContentType: response.ContentType,
        })
      );

      if (!response.Metadata) {
        throw new Error(`No metadata found on ${srcKey}`);
      }

      const params = {
        TableName: DDB_TABLE,
        Item: {
          identityId: { S: identityId },
          objectKey: { S: srcKey },
          thumbnailKey: { S: dstKey },
          isPublic: { BOOL: isPublic },
          uploadDate: { S: eventTime },
          uploadDay: { S: eventTime.substr(0, 10) },
          title: { S: title },
          description: { S: description },
        },
      };

      await dynamoDbClient.send(new PutItemCommand(params));
    }

    console.log("Ok");
  } catch (error) {
    console.error(error);
  }
};

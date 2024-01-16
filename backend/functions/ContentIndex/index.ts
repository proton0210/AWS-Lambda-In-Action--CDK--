import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  PutObjectCommand as S3PutObjectCommand,
  PutObjectCommandOutput,
} from "@aws-sdk/client-s3";

interface ImageItem {
  identityId: string;
  objectKey: string;
  thumbnailKey: string;
  uploadDate: string;
  title: string;
  description: string;
}

const AWS_REGION = "ap-south-1"; // Replace with your AWS region
const S3_BUCKET = "s3stack-mediabucketbcbb02ba-6hjyaisdy92q"; // Replace with your S3 bucket name
const CONTENT_TABLE = "ContentTable"; // Replace with your DynamoDB table name

const dynamoDbClient = new DynamoDBClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });

function uploadToS3(
  params: S3PutObjectCommand["input"]
): Promise<PutObjectCommandOutput | void> {
  return s3Client.send(new S3PutObjectCommand(params));
}

async function indexContent(
  dynamodbParams: QueryCommand["input"],
  s3Params: S3PutObjectCommand["input"]
): Promise<void> {
  const content: ImageItem[] = [];
  const dynamoDbResponse = await dynamoDbClient.send(
    new QueryCommand(dynamodbParams)
  );

  dynamoDbResponse.Items?.forEach((item) => {
    console.log(item);
    content.push({
      identityId: item.identityId.S!,
      objectKey: item.objectKey.S!,
      thumbnailKey: item.thumbnailKey.S!,
      uploadDate: item.uploadDate.S!,
      title: item.title.S!,
      description: item.description.S!,
    });
  });

  s3Params.Body = JSON.stringify(content);
  await uploadToS3(s3Params);
}

async function indexPublicContent(day: string): Promise<void> {
  console.log("Getting public content for " + day);

  const dynamodbParams = {
    TableName: CONTENT_TABLE,
    IndexName: "uploadDayIndex",
    Limit: 100,
    ScanIndexForward: false,
    KeyConditionExpression: "uploadDay = :uploadDayVal",
    FilterExpression: "isPublic = :isPublicVal",
    ExpressionAttributeValues: {
      ":uploadDayVal": { S: day },
      ":isPublicVal": { BOOL: true },
    },
  };

  const s3Params = {
    Bucket: S3_BUCKET,
    Key: "public/index/content.json",
    ContentType: "application/json",
  };

  await indexContent(dynamodbParams, s3Params);
}

async function indexPrivateContent(identityId: string): Promise<void> {
  console.log("Getting private content for " + identityId);

  const dynamodbParams = {
    TableName: CONTENT_TABLE,
    ScanIndexForward: false,
    KeyConditionExpression: "identityId = :identityIdVal",
    FilterExpression: "isPublic = :isPublicVal",
    ExpressionAttributeValues: {
      ":identityIdVal": { S: identityId },
      ":isPublicVal": { BOOL: false },
    },
  };

  const s3Params = {
    Bucket: S3_BUCKET,
    Key: `private/index/${identityId}/content.json`,
    ContentType: "application/json",
  };

  await indexContent(dynamodbParams, s3Params);
}

export const handler = async (event: { Records: any[] }): Promise<void> => {
  try {
    const uploadDays: Record<string, boolean> = {};
    const identityIds: Record<string, boolean> = {};

    event.Records.forEach((record) => {
      console.log(record.eventID);
      console.log(record.eventName);
      console.log("DynamoDB Record: %j", record.dynamodb);

      if ("NewImage" in record.dynamodb) {
        const image = record.dynamodb.NewImage;
        if (image.isPublic.BOOL && "uploadDay" in image) {
          const uploadDay = image.uploadDay.S;
          uploadDays[uploadDay] = true;
          console.log("Public content found for " + uploadDay);
        } else {
          const identityId = record.dynamodb.Keys.identityId.S;
          identityIds[identityId] = true;
          console.log("Private content found for " + identityId);
        }
      }
    });

    const latestUploadDay = Object.keys(uploadDays).sort().pop();
    if (latestUploadDay) {
      await indexPublicContent(latestUploadDay);
    }

    await Promise.all(
      Object.keys(identityIds).map((identityId) =>
        indexPrivateContent(identityId)
      )
    );

    console.log("Ok");
  } catch (error) {
    console.error(error);
  }
};

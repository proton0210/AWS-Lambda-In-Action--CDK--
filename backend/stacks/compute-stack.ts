import * as cdk from "aws-cdk-lib";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Architecture, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { CONTENT_TABLE_ARN, MEDIA_BUCKET_ARN } from "../constants";
import path = require("path");

interface ComputeStackProps extends cdk.StackProps {
  mediaBucket: s3.Bucket;
  contentTable: TableV2;
}
export class ComputeStack extends cdk.Stack {
  public readonly ContentUpdated: NodejsFunction;
  public readonly ContentIndex: NodejsFunction;
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    this.ContentUpdated = this.createContentUpdated(props);
    this.ContentIndex = this.createContentIndex(props);
  }
  createContentUpdated(props: ComputeStackProps): NodejsFunction {
    const func = new NodejsFunction(this, "contentUpdateFunc", {
      functionName: "contentUpdatedFunc",
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../functions/ContentUpdated/index.ts"),
      memorySize: 1024,
      architecture: Architecture.ARM_64,
      bundling: {
        externalModules: ["sharp"],
        sourceMap: true,
        nodeModules: ["sharp"],
        forceDockerBundling: true,
      },
    });

    func.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [
          MEDIA_BUCKET_ARN + "/public/content/*",
          MEDIA_BUCKET_ARN + "/public/thumbnails/*",
          MEDIA_BUCKET_ARN + "/private/content/*",
          MEDIA_BUCKET_ARN + "/private/thumbnails/*",
        ],
      })
    );
    func.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:PutItem", "dynamodb:DeleteItem"],
        resources: [CONTENT_TABLE_ARN],
      })
    );

    const s3PutEventSource = new cdk.aws_lambda_event_sources.S3EventSource(
      props.mediaBucket,
      {
        events: [s3.EventType.OBJECT_CREATED_PUT],
        filters: [{ prefix: "public/content/" }],
      }
    );

    func.addEventSource(s3PutEventSource);

    return func;
  }
  createContentIndex(props: ComputeStackProps): NodejsFunction {
    const func = new NodejsFunction(this, "contentIndexFunc", {
      functionName: "contentIndexFunc",
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../functions/ContentIndex/index.ts"),
    });
    func.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:putObject"],
        resources: [
          MEDIA_BUCKET_ARN + "/public/index/*",
          MEDIA_BUCKET_ARN + "/private/index/*",
        ],
      })
    );
    func.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:*"],
        resources: [
          CONTENT_TABLE_ARN,
          CONTENT_TABLE_ARN + "/index/uploadDayIndex",
        ],
      })
    );

    const dynamoTableSource =
      new cdk.aws_lambda_event_sources.DynamoEventSource(props.contentTable, {
        startingPosition: cdk.aws_lambda.StartingPosition.LATEST,
      });

    func.addEventSource(dynamoTableSource);
    return func;
  }
}

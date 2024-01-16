import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";

interface S3StackProps extends cdk.StackProps {}

export class S3Stack extends cdk.Stack {
  public readonly mediaBucket: Bucket;
  constructor(scope: Construct, id: string, props?: S3StackProps) {
    super(scope, id, props);
    this.mediaBucket = this.createMediaBucket();
    this.outputValues(this.mediaBucket);
  }
  createMediaBucket(): Bucket {
    const mediaBucket = new Bucket(this, "MediaBucket", {
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    return mediaBucket;
  }
  outputValues(mediaBucket: Bucket) {
    new cdk.CfnOutput(this, "MediaBucketARN", {
      value: mediaBucket.bucketArn,
    });
  }
}

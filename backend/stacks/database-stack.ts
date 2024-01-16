import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import {
  AttributeType,
  TableV2,
  StreamViewType,
} from "aws-cdk-lib/aws-dynamodb";

interface DatabaseStackProps extends cdk.StackProps {}

export class DatabaseStack extends cdk.Stack {
  public readonly contentTable: TableV2;

  constructor(scope: Construct, id: string, props?: DatabaseStackProps) {
    super(scope, id, props);
    this.contentTable = this.createContenTable();
    this.output();
  }
  createContenTable(): TableV2 {
    const table = new TableV2(this, "ContentTable", {
      tableName: "ContentTable",
      partitionKey: { name: "identityId", type: AttributeType.STRING },
      sortKey: { name: "objectKey", type: AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      dynamoStream: StreamViewType.NEW_IMAGE,
    });

    // get most recent uploads
    table.addGlobalSecondaryIndex({
      partitionKey: { name: "uploadDay", type: AttributeType.STRING },
      sortKey: { name: "uploadDate", type: AttributeType.STRING },
      indexName: "uploadDayIndex",
    });

    return table;
  }

  output() {
    new cdk.CfnOutput(this, "ContentTableARN", {
      value: this.contentTable.tableArn,
    });
  }
}

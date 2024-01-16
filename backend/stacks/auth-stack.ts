import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_cognito as Cognito } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  IdentityPool,
  UserPoolAuthenticationProvider,
} from "@aws-cdk/aws-cognito-identitypool-alpha";
import { CONTENT_TABLE_ARN, MEDIA_BUCKET_ARN } from "../constants";

interface authStackProps extends cdk.StackProps {}

export class AuthStack extends cdk.Stack {
  public readonly userPool: Cognito.UserPool;
  public readonly userPoolClient: Cognito.UserPoolClient;
  public readonly identityPool: IdentityPool;

  constructor(scope: Construct, id: string, props?: authStackProps) {
    super(scope, id, props);
    this.userPool = this.createUserPool();
    this.userPoolClient = this.createWebClient();
    this.identityPool = this.createidentityPool();
    this.output();
  }

  createUserPool(props?: authStackProps) {
    const userPool = new Cognito.UserPool(this, "MediaSharingUserPool", {
      userPoolName: "MEDIA-USER-POOL",
      selfSignUpEnabled: true,
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        name: new Cognito.StringAttribute({
          minLen: 3,
          maxLen: 20,
        }),
      },
    });
    return userPool;
  }

  createWebClient() {
    const userPoolClient = new Cognito.UserPoolClient(
      this,
      "MediaSharingUserPoolClient",
      {
        userPool: this.userPool,
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
      }
    );
    return userPoolClient;
  }

  createidentityPool() {
    const identityPool = new IdentityPool(this, "MediaSharingIdentityPool", {
      identityPoolName: "MEDIA-SHARING-IDENTITY-POOL",
      authenticationProviders: {
        userPools: [
          new UserPoolAuthenticationProvider({
            userPool: this.userPool,
            userPoolClient: this.userPoolClient,
          }),
        ],
      },
    });
    identityPool.unauthenticatedRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [MEDIA_BUCKET_ARN + "/public/*"],
      })
    );
    identityPool.authenticatedRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [
          `${MEDIA_BUCKET_ARN}/public/*`,
          `${MEDIA_BUCKET_ARN}/private/index/${"cognito-identity.amazonaws.com:sub"}/*`,
          `${MEDIA_BUCKET_ARN}/private/content/${"cognito-identity.amazonaws.com:sub"}/*`,
          `${MEDIA_BUCKET_ARN}/private/thumbnail/${"cognito-identity.amazonaws.com:sub"}/*`,
          `${MEDIA_BUCKET_ARN}/public/content/${"cognito-identity.amazonaws.com:sub"}/*`,
          `${MEDIA_BUCKET_ARN}/private/content/${"cognito-identity.amazonaws.com:sub"}/*`,
        ],
      })
    );
    identityPool.authenticatedRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:UpdateItem"],
        resources: [CONTENT_TABLE_ARN],
        conditions: {
          "ForAllValues:StringEquals": {
            "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"],
            "dynamodb:Attributes": ["title", "description"],
          },
          StringEqualsIfExists: {
            "dynamodb:Select": "SPECIFIC_ATTRIBUTES",
            "dynamodb:ReturnValues": ["NONE", "UPDATED_OLD", "UPDATED_NEW"],
          },
        },
      })
    );

    return identityPool;
  }

  output() {
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
    });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "IdentityPoolId", {
      value: this.identityPool.identityPoolId,
    });
  }
}

#!/bin/bash
# Azure Infrastructure Setup for Emergency Payment Runbook
# Run these commands once to create the required Azure resources

set -e

# Configuration
RESOURCE_GROUP="rg-emrgpay"
LOCATION="eastus2"
VNET_NAME="vnet-emrgpay"
AKS_SUBNET="snet-aks"
APPSERVICE_SUBNET="snet-appservice"
ACR_NAME="acremrgpay"
AKS_NAME="aks-emrgpay"
IDENTITY_NAME="id-emrgpay-aks"
APP_SERVICE_PLAN="asp-emrgpay"
WEBAPP_NAME="emrgpay-frontend"

# Your Azure AI Foundry resource (existing - read-only access needed)
AI_FOUNDRY_RESOURCE_GROUP="YOUR_AI_FOUNDRY_RG"  # Update this
AI_FOUNDRY_RESOURCE_NAME="ozgurguler-7212-resource"

echo "=== Phase 1: Create Azure Infrastructure ==="

# Create Resource Group
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Virtual Network with subnets
echo "Creating VNet..."
az network vnet create \
  --resource-group $RESOURCE_GROUP \
  --name $VNET_NAME \
  --address-prefixes 10.0.0.0/16 \
  --subnet-name $AKS_SUBNET \
  --subnet-prefixes 10.0.0.0/22

az network vnet subnet create \
  --resource-group $RESOURCE_GROUP \
  --vnet-name $VNET_NAME \
  --name $APPSERVICE_SUBNET \
  --address-prefixes 10.0.4.0/24 \
  --delegations Microsoft.Web/serverFarms

# Create Container Registry
echo "Creating ACR..."
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic

# Create Managed Identity for AKS workload identity
echo "Creating managed identity..."
az identity create \
  --resource-group $RESOURCE_GROUP \
  --name $IDENTITY_NAME

IDENTITY_CLIENT_ID=$(az identity show --resource-group $RESOURCE_GROUP --name $IDENTITY_NAME --query clientId -o tsv)
IDENTITY_PRINCIPAL_ID=$(az identity show --resource-group $RESOURCE_GROUP --name $IDENTITY_NAME --query principalId -o tsv)

echo "Managed Identity Client ID: $IDENTITY_CLIENT_ID"

# Get AKS subnet ID
AKS_SUBNET_ID=$(az network vnet subnet show \
  --resource-group $RESOURCE_GROUP \
  --vnet-name $VNET_NAME \
  --name $AKS_SUBNET \
  --query id -o tsv)

# Create AKS Cluster with workload identity
echo "Creating AKS cluster (this takes several minutes)..."
az aks create \
  --resource-group $RESOURCE_GROUP \
  --name $AKS_NAME \
  --node-count 1 \
  --node-vm-size Standard_D2s_v3 \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --network-plugin azure \
  --vnet-subnet-id $AKS_SUBNET_ID \
  --service-cidr 10.1.0.0/16 \
  --dns-service-ip 10.1.0.10 \
  --attach-acr $ACR_NAME \
  --generate-ssh-keys

# Get AKS OIDC issuer URL
AKS_OIDC_ISSUER=$(az aks show --resource-group $RESOURCE_GROUP --name $AKS_NAME --query "oidcIssuerProfile.issuerUrl" -o tsv)

# Create federated credential for workload identity
echo "Creating federated credential..."
az identity federated-credential create \
  --name "emrgpay-backend-fedcred" \
  --identity-name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --issuer $AKS_OIDC_ISSUER \
  --subject "system:serviceaccount:emrgpay:emrgpay-backend" \
  --audience "api://AzureADTokenExchange"

# Create App Service Plan
echo "Creating App Service Plan..."
az appservice plan create \
  --resource-group $RESOURCE_GROUP \
  --name $APP_SERVICE_PLAN \
  --sku P1v3 \
  --is-linux

# Create Web App
echo "Creating Web App..."
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $WEBAPP_NAME \
  --runtime "NODE:20-lts"

# Configure VNet integration for App Service
echo "Configuring VNet integration..."
az webapp vnet-integration add \
  --resource-group $RESOURCE_GROUP \
  --name $WEBAPP_NAME \
  --vnet $VNET_NAME \
  --subnet $APPSERVICE_SUBNET

echo ""
echo "=== Phase 2: Configure Identity Permissions ==="

# Grant managed identity access to Azure OpenAI/AI Foundry
# NOTE: Update AI_FOUNDRY_RESOURCE_GROUP with your actual resource group
echo "Granting Cognitive Services OpenAI User role..."
az role assignment create \
  --assignee $IDENTITY_PRINCIPAL_ID \
  --role "Cognitive Services OpenAI User" \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$AI_FOUNDRY_RESOURCE_GROUP/providers/Microsoft.CognitiveServices/accounts/$AI_FOUNDRY_RESOURCE_NAME"

echo ""
echo "=== Phase 3: Setup GitHub OIDC ==="

# Create Azure AD App Registration for GitHub Actions
echo "Creating Azure AD app registration..."
GITHUB_APP=$(az ad app create --display-name "github-emrgpay-deploy")
GITHUB_APP_ID=$(echo $GITHUB_APP | jq -r '.appId')

# Create service principal
az ad sp create --id $GITHUB_APP_ID

# Get subscription ID
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# Grant Contributor role on resource group
echo "Granting Contributor role..."
az role assignment create \
  --assignee $GITHUB_APP_ID \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"

# Grant AcrPush role on ACR
echo "Granting AcrPush role..."
az role assignment create \
  --assignee $GITHUB_APP_ID \
  --role "AcrPush" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerRegistry/registries/$ACR_NAME"

# Create federated credential for GitHub Actions (main branch)
# NOTE: Update GITHUB_ORG and GITHUB_REPO with your values
GITHUB_ORG="ozgurgulerx"
GITHUB_REPO="emergency-payment"

echo "Creating GitHub federated credential..."
az ad app federated-credential create \
  --id $GITHUB_APP_ID \
  --parameters '{
    "name": "github-main-branch",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$GITHUB_ORG/$GITHUB_REPO"':ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

TENANT_ID=$(az account show --query tenantId -o tsv)

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Add these secrets to your GitHub repository:"
echo "  AZURE_CLIENT_ID: $GITHUB_APP_ID"
echo "  AZURE_TENANT_ID: $TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
echo ""
echo "Update the ServiceAccount manifest with:"
echo "  Managed Identity Client ID: $IDENTITY_CLIENT_ID"
echo ""
echo "Next steps:"
echo "  1. Add GitHub secrets (Settings > Secrets > Actions)"
echo "  2. Update deploy/kubernetes/serviceaccount.yaml with the client ID"
echo "  3. Push to main branch to trigger deployment"
echo ""
echo "Useful commands:"
echo "  kubectl get pods -n emrgpay"
echo "  kubectl logs -n emrgpay -l app=emrgpay-backend"
echo "  az webapp log tail --resource-group $RESOURCE_GROUP --name $WEBAPP_NAME"

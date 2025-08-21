/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export var SecurityLevel;
(function (SecurityLevel) {
    SecurityLevel["SAFE"] = "safe";
    SecurityLevel["MODERATE"] = "moderate";
    SecurityLevel["DANGEROUS"] = "dangerous";
    SecurityLevel["CRITICAL"] = "critical";
})(SecurityLevel || (SecurityLevel = {}));
export var RiskType;
(function (RiskType) {
    RiskType["FILE_SYSTEM_ACCESS"] = "file_system_access";
    RiskType["COMMAND_EXECUTION"] = "command_execution";
    RiskType["NETWORK_ACCESS"] = "network_access";
    RiskType["DATA_EXPOSURE"] = "data_exposure";
    RiskType["PRIVILEGE_ESCALATION"] = "privilege_escalation";
    RiskType["ENVIRONMENT_MANIPULATION"] = "environment_manipulation";
    RiskType["SYSTEM_MODIFICATION"] = "system_modification";
    RiskType["CREDENTIAL_ACCESS"] = "credential_access";
    RiskType["INFORMATION_GATHERING"] = "information_gathering";
})(RiskType || (RiskType = {}));
export var SecurityCheckCategory;
(function (SecurityCheckCategory) {
    SecurityCheckCategory["INPUT_VALIDATION"] = "input_validation";
    SecurityCheckCategory["ACCESS_CONTROL"] = "access_control";
    SecurityCheckCategory["DATA_PROTECTION"] = "data_protection";
    SecurityCheckCategory["COMMAND_SAFETY"] = "command_safety";
    SecurityCheckCategory["NETWORK_SECURITY"] = "network_security";
    SecurityCheckCategory["FILE_SYSTEM_SECURITY"] = "file_system_security";
    SecurityCheckCategory["PRIVILEGE_MANAGEMENT"] = "privilege_management";
})(SecurityCheckCategory || (SecurityCheckCategory = {}));
export var MitigationType;
(function (MitigationType) {
    MitigationType["DENY_ACCESS"] = "deny_access";
    MitigationType["REQUIRE_CONFIRMATION"] = "require_confirmation";
    MitigationType["RESTRICT_PARAMETERS"] = "restrict_parameters";
    MitigationType["SANDBOX_EXECUTION"] = "sandbox_execution";
    MitigationType["AUDIT_LOG"] = "audit_log";
    MitigationType["RATE_LIMIT"] = "rate_limit";
    MitigationType["ENCRYPT_DATA"] = "encrypt_data";
    MitigationType["VALIDATE_INPUT"] = "validate_input";
})(MitigationType || (MitigationType = {}));
export var SecurityEventType;
(function (SecurityEventType) {
    SecurityEventType["BOUNDARY_VIOLATION"] = "boundary_violation";
    SecurityEventType["COMMAND_BLOCKED"] = "command_blocked";
    SecurityEventType["SUSPICIOUS_ACTIVITY"] = "suspicious_activity";
    SecurityEventType["PRIVILEGE_ESCALATION_ATTEMPT"] = "privilege_escalation_attempt";
    SecurityEventType["DATA_ACCESS_VIOLATION"] = "data_access_violation";
    SecurityEventType["NETWORK_VIOLATION"] = "network_violation";
    SecurityEventType["AUTHENTICATION_FAILURE"] = "authentication_failure";
    SecurityEventType["CONFIGURATION_TAMPERING"] = "configuration_tampering";
})(SecurityEventType || (SecurityEventType = {}));
export var SecurityAction;
(function (SecurityAction) {
    SecurityAction["ALLOW"] = "allow";
    SecurityAction["DENY"] = "deny";
    SecurityAction["REQUIRE_CONFIRMATION"] = "require_confirmation";
    SecurityAction["SANDBOX"] = "sandbox";
    SecurityAction["AUDIT_ONLY"] = "audit_only";
    SecurityAction["RATE_LIMIT"] = "rate_limit";
    SecurityAction["ESCALATE"] = "escalate";
})(SecurityAction || (SecurityAction = {}));
//# sourceMappingURL=types.js.map
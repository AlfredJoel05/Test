/**
 * Copyright (c) 1998-2019 Oracle NetSuite GBU, Inc.
 * 2955 Campus Drive, Suite 100, San Mateo, CA, USA 94403-2511
 * All Rights Reserved.
 *
 * This software is the confidential and proprietary information of
 * Oracle NetSuite GBU, Inc. ("Confidential Information"). You shall not
 * disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into
 * with Oracle NetSuite GBU.
 *
 * Module Description
 * EERP34
 * Approval routing for Purchase order and standalone Vendor Bills based on Chart of Approvals
 *
 * Version    Date          Author                  Remarks
 * 1.00       19 Jul 2019   Stanislav Hradela       Initial version
 * 1.10       22 Jul 2019   Lukas Astalos           Changes after dubugging
 * 1.20       01 Aug 2019   Lukas Astalos           Prevent approval logic if the Bill is created as approved from Intercompany transformation (ERP13)
 * 1.30       06 Aug 2019   Lukas Astalos           Don't display approval buttons if VB is pending automatic 3-way matching
 * 1.40       12 Aug 2019   Lukas Astalos           If Risk Assesment is checked, route to Item Category manager + don't run logic of requestor is missing
 * 1.50       19 Aug 2019   Lukas Astalos           CMFI-1436: The HR level should also act as an approval limit
 * 1.60       02 Sep 2019   Lukas Astalos           Added consideration of HR levels overlapping (Director of Finance = L2, etc.)
 * 1.70       10 Sep 2019   Lukas Astalos           Added exception for webservices
 * 1.80       13 Sep 2019   Lukas Astalos           BUG_304, BUG320 fix
 * 1.81       16 Sep 2019   Lukas Astalos           BUG_324 Discard loop, don't show Resubmit button when cancelled
 * 1.82       25 Sep 2019   Lukas Astalos           Added Admin Core Permission Role
 * 1.83       02 Oct 2019   Lukas Astalos           Fix for vendor bill number in the email + reject only link for 3-way matching
 * 1.84       21 Oct 2019   Lukas Astalos           CR_1034: Fixed infinite loop after re-submission, re-arranged if-else statements in beforeSubmit
 * 1.85       12 Nov 2019   Lukas Astalos           Only convert to USD if the values changed; removed logs
 * 1.86       13 Nov 2019   Lukas Astalos           Don't send vendor email if missing email
 * 1.87       13 Nov 2019   Lukas Astalos           Get sourced fields in CSV import
 * 1.88       22 Nov 2019   Lukas Astalos           Query replaced by search
 * 1.89       02 Dec 2019   Lukas Astalos           Check Emp Proc Level when adding to Additional Approves in goToNextLevel
 * 1.90       16 Dec 2019   Lukas Astalos           Optional IC2 Approver
 * 1.91       16 Dec 2019   Lukas Astalos           Skip Submission, ProcOp, Item Category Mngr and Supervisor for Partner Transactions
 * 1.91.01    20 Dec 2019   Lukas Astalos           Fix for re-submission for partner transactions
 * 1.92       17 Jan 2020   Lukas Astalos           Filter employees without email + imporoved error catching
 * 1.92.01    21 Jan 2020   Lukas Astalos           Catch email options
 * 1.93       27 Mar 2020   Lukas Astalos           CR269 RPL Synchronization: Reject if OSGT Status = Blocked
 * 1.94       01 Apr 2020   Lukas Astalos           isEmpty fix for multiselect field
 * 1.95       03 Apr 2020   Lukas Astalos           Fix in condition to send role based email (Defect 4288)
 * 1.96       03 Apr 2020   Lukas Astalos           Custom Employee field on Vendor Bill
 * 1.97       03 Apr 2020   Lukas Astalos           PSR284 Partner Management Email Templates
 * 1.98       08 Apr 2020   Lukas Astalos           Defect 4446, clear Next Approver when approved
 * 1.99       08 Apr 2020   Lukas Astalos           Defect 4454, reset Approved By when approval restarted
 * 2.00       08 Apr 2020   Lukas Astalos           PSR293 Universal Procurement Categories
 * 2.01       09 Apr 2020   Lukas Astalos           Add email from PO when emailing vendor upon approval
 * 2.02       15 May 2020   Lukas Astalos           OSGT Blocked changed to ON_HOLD
 * 2.03       21 May 2020   Lukas Astalos           Web Services exception in afterSbumit
 * 2.04       07 Jul 2020   Lukas Astalos           Defect 8773: don't restart 3-way matching if already approved
 * 2.05       14 Jul 2020   Lukas Astalos           Defect 8790: Remove Submit for IC approval
 * 2.06       03 Feb 2021   Matej Mrazek            Defect 18015: Do not send stand-alone VB for re-approval on EDIT -> NOT VALID ANYMORE, replaced by 2.07 (22 Feb 2021)
 * 2.07       22 Feb 2021   Matej Mrazek            Defect 18015: Do not send open VB for re-approval on EDIT
 * 2.08       12 Jul 2021   Anukaran                Added code for re-approval based on conditions.
 */

/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(
    [ 'N/record',
        'N/runtime',
        /*'N/query',*/
        'N/search',
        'N/currency',
        'N/render',
        'N/file',
        'N/email',
        'N/url',
        'N/ui/serverWidget',
        'N/error',
        '/SuiteScripts/Libraries/mf_lib.js',
        './mf_const_eerp34.js' ],
    function(record, runtime, /*query,*/search, currency, render, file, email, url, ui, error, mf_lib, constants) {

        var ATTACH_EMAIL = true;

        function beforeLoad_approvalRouting(context) {

            try {

                var objNewTransaction = context.newRecord;
                var objCurrentUser = runtime.getCurrentUser();
                var objForm = context.form;

                var boolCurrentUserApproverDelegate = false;

                var stUrl = '';

                if (context.type == context.UserEventType.CREATE || context.type == context.UserEventType.COPY) {

                    // if (objNewTransaction.type == record.Type.PURCHASE_ORDER) {
                    //     objNewTransaction.setValue({
                    //         fieldId : 'employee',
                    //         value : objCurrentUser.id
                    //     });
                    // } else
                    if (objNewTransaction.type == record.Type.VENDOR_BILL) {
                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_je_employee',
                            value : objCurrentUser.id
                        });
                    }

                    objNewTransaction.setValue({
                        fieldId : 'custbody_mf_tran_requestor',
                        value : objCurrentUser.id
                    });

                    // clear fields
                    for ( var i in constants.FLD_TO_CLEAR) {
                        objNewTransaction.setValue({
                            fieldId : constants.FLD_TO_CLEAR[i],
                            value : ''
                        });
                    }

                    var objApprovalNoteField = objForm.getField({
                        id : 'custbody_mf_approvalroutingnote'
                    });

                    objApprovalNoteField.updateDisplayType({
                        displayType : ui.FieldDisplayType.HIDDEN
                    });

                }

                var stPORef = objNewTransaction.getValue('custbody_mf_rel_po_ref');

                // if ((context.type == context.UserEventType.VIEW || context.type == context.UserEventType.CREATE
                //         || context.type == context.UserEventType.EDIT || context.type == context.UserEventType.COPY)
                //         && runtime.executionContext == runtime.ContextType.USER_INTERFACE) {

                // Defect 18015 -> If EDIT on stand-alone VB -> don't send for approval
                if ((context.type == context.UserEventType.VIEW || context.type == context.UserEventType.CREATE
                    || context.type == context.UserEventType.EDIT || context.type == context.UserEventType.COPY)
                    && runtime.executionContext == runtime.ContextType.USER_INTERFACE) {

                    if (context.type == context.UserEventType.VIEW && runtime.executionContext == runtime.ContextType.USER_INTERFACE) {
                        var arrNextApprovers = objNewTransaction.getValue({
                            fieldId : 'custbody_mf_next_approvers'
                        });

                        if (!isEmpty(arrNextApprovers) && arrNextApprovers != -1) {
                            try {
                                boolCurrentUserApproverDelegate = mf_lib.currentUserApprovalDelegate(arrNextApprovers, objCurrentUser.id);
                            } catch (e) {
                                log.error('Delegation error', 'arrNextApprovers = ' + arrNextApprovers + ', objCurrentUser.id = '
                                    + objCurrentUser.id);
                                customLog(e);
                            }
                        }
                    }
                    // rec ID empty when create
                    stUrl = url.resolveScript({
                        scriptId : 'customscript_mf_sl_chart_of_approvals',
                        deploymentId : 'customdeploy_mf_sl_chart_of_approvals',
                        returnExternalUrl : false,
                        params : {
                            user : runtime.getCurrentUser().id,
                            user_name : runtime.getCurrentUser().name,
                            is_delegate : boolCurrentUserApproverDelegate ? 'T' : 'F',
                            rec_type : context.newRecord.type,
                            rec_id : context.newRecord.id

                        }
                    });

                    if (context.type == context.UserEventType.CREATE || context.type == context.UserEventType.EDIT
                        || context.type == context.UserEventType.COPY) {
                        // add url to the form for lookup suitelet
                        var fldUrl = objForm.addField({
                            id : 'custpage_sl_url',
                            type : ui.FieldType.TEXT,
                            label : 'SL URL'
                        });
                        fldUrl.updateDisplayType({
                            displayType : ui.FieldDisplayType.HIDDEN
                        });
                        fldUrl.defaultValue = stUrl;
                    }
                }

                if (context.type == context.UserEventType.VIEW && runtime.executionContext == runtime.ContextType.USER_INTERFACE) {

                    objForm.clientScriptModulePath = './mf_cs_chart_of_approvals_eerp34.js'; // script name required

                    var intApprovalMatrixId = objNewTransaction.getValue({
                        fieldId : 'custbody_mf_procur_approval_matrix'
                    });

                    var boolMatrixEmpty = isEmpty(intApprovalMatrixId);

                    var arrNextApprovers = objNewTransaction.getValue({
                        fieldId : 'custbody_mf_next_approvers'
                    });

                    var intApprovalRoutingNoteId = objNewTransaction.getValue({
                        fieldId : 'custbody_mf_approvalroutingnote'
                    });

                    var intApprovalRoleId = objNewTransaction.getValue({
                        fieldId : 'custbody_mf_approval_role'
                    });

                    var strTransactionStatus = objNewTransaction.getValue({
                        fieldId : 'approvalstatus'
                    });

                    var intRequestorId = objNewTransaction.getValue({
                        fieldId : 'custbody_mf_tran_requestor'
                    });

                    var intEmployeeId = '';
                    if (objNewTransaction.type == record.Type.PURCHASE_ORDER) {
                        intEmployeeId = objNewTransaction.getValue({
                            fieldId : 'employee'
                        });
                    } else if (objNewTransaction.type == record.Type.VENDOR_BILL) {
                        intEmployeeId = objNewTransaction.getValue({
                            fieldId : 'custbody_mf_je_employee'
                        });
                    }

                    var stStatusRef = objNewTransaction.getValue({
                        fieldId : 'statusRef' // different tan approvalstatus
                    });

                    /*log.debug({
                        title : 'New Transaction Values',
                        details : {
                            intApprovalRoutingNoteId : intApprovalRoutingNoteId,
                            arrNextApprovers : arrNextApprovers,
                            intApprovalRoleId : intApprovalRoleId,
                            strTransactionStatus : strTransactionStatus,
                            intRequestorId : intRequestorId,
                            intEmployeeId : intEmployeeId,
                            objCurrentUser : objCurrentUser.id,
                            statusRef : stStatusRef
                        }
                    });
                    //log.debug('arrNextApprovers.indexOf(objCurrentUser.id)', arrNextApprovers.indexOf(objCurrentUser.id.toString()));*/

                    if (intApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_submission
                        && (objCurrentUser.id == intRequestorId || objCurrentUser.id == intEmployeeId || constants.ADMIN_ROLES
                            .indexOf(objCurrentUser.roleId) != -1)) {

                        objForm.addButton({
                            id : 'custpage_btn_sbmt_approval',
                            label : 'Submit for Approval',
                            functionName : 'submitForApproval(' + boolMatrixEmpty + ', "' + stUrl + '")'
                        });

                    } else if (intApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_3way_matching_rejection
                        && (arrNextApprovers.indexOf(objCurrentUser.id.toString()) != -1 || boolCurrentUserApproverDelegate || constants.ADMIN_ROLES
                            .indexOf(objCurrentUser.roleId) != -1)) {

                        objForm.addButton({
                            id : 'custpage_btn_reject',
                            label : 'Reject',
                            functionName : 'reject("' + stUrl + '")'
                        });

                    } else if (strTransactionStatus == constants.PO_VB_STATUS.pending
                        && intApprovalRoutingNoteId != constants.PO_VB_ARN.awaiting_3way_matching_auto
                        && (objCurrentUser.role == intApprovalRoleId || constants.ADMIN_ROLES.indexOf(objCurrentUser.roleId) != -1
                            || arrNextApprovers.indexOf(objCurrentUser.id.toString()) != -1 || boolCurrentUserApproverDelegate)) {

                        objForm.addButton({
                            id : 'custpage_btn_approve',
                            label : 'Approve',
                            functionName : 'approve("' + stUrl + '")'
                        });

                        objForm.addButton({
                            id : 'custpage_btn_reject',
                            label : 'Reject',
                            functionName : 'reject("' + stUrl + '")'
                        });

                        if (constants.ADMIN_ROLES.indexOf(objCurrentUser.roleId) != -1) {
                            objForm.addButton({
                                id : 'custpage_btn_superapprove',
                                label : 'Super - Approve (Admin)',
                                functionName : 'superapprove("' + stUrl + '")'
                            });
                        }

                    } else if (strTransactionStatus == constants.PO_VB_STATUS.rejected
                        && intApprovalRoutingNoteId != constants.PO_VB_ARN.discarded
                        && (objCurrentUser.id == intRequestorId || objCurrentUser.id == intEmployeeId || constants.ADMIN_ROLES
                            .indexOf(objCurrentUser.roleId) != -1)) {

                        if (stStatusRef != constants.PO_VB_STATUS.cancelled) {
                            objForm.addButton({
                                id : 'custpage_btn_resubmit',
                                label : 'Re-Submit for Approval',
                                functionName : 'submitForApproval(' + boolMatrixEmpty + ', "' + stUrl + '")'
                            });
                        }

                        objForm.addButton({
                            id : 'custpage_btn_discard',
                            label : 'Discard',
                            functionName : 'discard("' + stUrl + '")'
                        });

                    }

                }

                log.debug("context.type", context.type);
                if ((context.type == context.UserEventType.EDIT || context.type == context.UserEventType.CREATE  || context.type == context.UserEventType.COPY ) && runtime.executionContext == runtime.ContextType.USER_INTERFACE){
                    let form = context.form;
                    if(form) {
                        let itemSublist = form.getSublist({id: "item"});
                        if(itemSublist) {
                            let fieldDepartment = itemSublist.getField({id: "department"});
                            if (Object.keys(fieldDepartment).length != 0) {
                                fieldDepartment.isMandatory = true;
                            }
                            let fieldLocation = itemSublist.getField({id: "location"});
                            if (Object.keys(fieldLocation).length != 0) {
                                fieldLocation.isMandatory = true;
                            }

                            // let recTran = context.newRecord;
                            //     let intHeaderLocation = recTran.getValue("location");
                            //     for (let i = 0, j = recTran.getLineCount("item"); i<j; i++){
                            //         recTran.setSublistValue({
                            //             sublistId: "item",
                            //             fieldId: "location",
                            //             value: intHeaderLocation,
                            //             line: i
                            //         });
                            // }
                        }
                    }
                }
            } catch (e) {
                customLog(e);
            }

        }

        function beforeSubmit_approvalRouting(context) {

            //log.debug('BEFORE SUBMIT', '---START---');

            try {

                //log.debug('BS', context.type + ' | ' + runtime.executionContext);

                if (runtime.executionContext == runtime.ContextType.WEBSERVICES) {
                    return;
                }

                var objCurrScript = runtime.getCurrentScript();
                var APPROVAL_CONFIG_ID = objCurrScript.getParameter('custscript_chart_of_approval_config');
                var objConfigRecord = null;

                var objNewTransaction = context.newRecord;

                // Defect 18015 -> If EDIT on open VB -> don't send for approval
                if (context.type == context.UserEventType.EDIT && objNewTransaction.type == record.Type.VENDOR_BILL && objNewTransaction.getValue('status') == 'Open')
                {
                    return;
                }
                
                // prevent triggering of XEDIT logic when PO is being updated by 3-way match Map/Reduce script
                var bApprovalUpdate = false;
                if (context.type == context.UserEventType.XEDIT) {
                    var stApprovedBy = objNewTransaction.getValue('custbody_mf_approved_by');
                    var stOldApprovedBy = context.oldRecord.getValue('custbody_mf_approved_by');
                    var bApprovedByChanged = stApprovedBy && stApprovedBy != stOldApprovedBy;

                    var stArn = objNewTransaction.getValue('custbody_mf_approvalroutingnote');
                    var stOldArn = context.oldRecord.getValue('custbody_mf_approvalroutingnote');
                    var bArnChanged = stArn && (stArn != stOldArn) && (stArn != constants.PO_VB_ARN.discarded);

                    bApprovalUpdate = bApprovedByChanged || bArnChanged;
                }
                ////log.debug('bApprovalUpdate', bApprovalUpdate);

                if (context.type == context.UserEventType.CREATE || context.type == context.UserEventType.EDIT) {
                    var bConvertUsd = false;
                    if (context.type == context.type == context.UserEventType.EDIT) {
                        var arrCheckFields = [ 'total', 'taxtotal', 'trandate', 'currency' ];
                        for ( var i in arrCheckFields) {
                            var stNewValue = context.newRecord.getValue(arrCheckFields[i]);
                            var stOldValue = context.oldRecord.getValue(arrCheckFields[i]);
                            if (!isEmpty(stNewValue) && !isEmpty(stOldValue) && stNewValue != stOldValue) {
                                bConvertUsd = true;
                                break;
                            }
                        }

                    } else {
                        bConvertUsd = true;
                    }

                    if (bConvertUsd) {
                        var usdAmount = convertToUSD(context.newRecord);

                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_usd_amount',
                            value : usdAmount
                        });
                    }

                }

                var intRequestorId = null;
                var objRequestorLookUp = {};

                var stStatus = objNewTransaction.getValue('approvalstatus');
                var stARN = objNewTransaction.getValue('custbody_mf_approvalroutingnote');
                var bPartnerTran = objNewTransaction.getValue('custbody_mf_partnertransaction');

                var objVendorData = {};
                // IC Bill is being created as approved, shouldn't be blocked by OSGT
                if (context.type == context.UserEventType.CREATE && stStatus != constants.PO_VB_STATUS.approved) {
                    objVendorData = search.lookupFields({
                        type : search.Type.VENDOR,
                        id : objNewTransaction.getValue('entity'),
                        columns : [ 'representingsubsidiary', 'custentity_osgt_screen_status' ]
                    });

                    if (!isEmpty(objVendorData) && objVendorData.custentity_osgt_screen_status[0]) {
                        var stOsgtStatus = objVendorData.custentity_osgt_screen_status[0].text;
                        if (stOsgtStatus == constants.OSGT_STATUS.on_hold) {
                            objNewTransaction.setValue('approvalstatus', constants.PO_VB_STATUS.rejected);
                            objNewTransaction.setValue('custbody_mf_approvalroutingnote', constants.PO_VB_ARN.rejected);
                            objNewTransaction.setValue('custbody_mf_rejection_reason', "Vendor's OSGT Status is Blocked");
                            objNewTransaction.setValue('custbody_mf_rejected_by', '');
                            objNewTransaction.setValue('custbody_mf_next_approvers', '');
                            objNewTransaction.setValue('custbody_mf_approval_role', '');
                            objNewTransaction.setValue('custbody_mf_add_approvers', '');
                            objNewTransaction.setValue('custbody_mf_current_app_level', '');
                            objNewTransaction.setValue('custbody_mf_approved_by', '');
                            objNewTransaction.setValue('custbody_mf_approval_audit_log', 'Auto-Rejected due to Blocked OSGT Status |');

                            return; // do not continue
                        }
                    }

                    // partner transactions - skip to CoA
                    // PSR284 Partner Management Email Templates  -> Partner Transactions are created by Integration as Approved
                    /*if (bPartnerTran) {
                        intRequestorId = objNewTransaction.getValue({
                            fieldId : 'custbody_mf_tran_requestor'
                        });
                        if (intRequestorId) { // might remove if the sourcing works correctly
                            objRequestorLookUp = search.lookupFields({
                                type : search.Type.EMPLOYEE,
                                id : intRequestorId,
                                columns : [ 'custentity_mf_employeeprocurementlevel', 'custentity_mf_procurementapprovalmatrix' ]
                            });
                            if (!isEmpty(objRequestorLookUp)) {
                                if (objRequestorLookUp.custentity_mf_employeeprocurementlevel[0]) {
                                    objNewTransaction.setValue({
                                        fieldId : 'custbody_mf_emp_procurement_level',
                                        value : objRequestorLookUp.custentity_mf_employeeprocurementlevel[0].value
                                    });
                                }
                                if (objRequestorLookUp.custentity_mf_procurementapprovalmatrix[0]) {
                                    objNewTransaction.setValue({
                                        fieldId : 'custbody_mf_procur_approval_matrix',
                                        value : objRequestorLookUp.custentity_mf_procurementapprovalmatrix[0].value
                                    });
                                }
                            }
                        }
                        objConfigRecord = record.load({
                            type : 'customrecord_mf_chart_of_approval_config',
                            id : APPROVAL_CONFIG_ID
                        });
                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_approval_route',
                            value : constants.buildApprovalRoute(objNewTransaction, objConfigRecord)
                        });
                        routeViaChartOfApprovals(null, objNewTransaction, objConfigRecord);
                        return; // do not continue
                    }*/

                }
                //log.debug("context.type", context.type);
                //log.debug("stStatus", stStatus);
                //log.debug("bPartnerTran",bPartnerTran);

                // log.debug("-------","-----------");
                // log.debug("context.type", context.type);
                // log.debug("created from", objNewTransaction.getValue("createdFrom"));
                // log.debug("purchase orders", objNewTransaction.getLineCount("purchaseorders"));
                // log.debug("context.type", context.type);
                if ((context.type == context.UserEventType.CREATE && stStatus != constants.PO_VB_STATUS.approved && !bPartnerTran)
                    || context.type == context.UserEventType.COPY
                    || (context.type == context.UserEventType.EDIT && !bPartnerTran && ((stStatus == constants.PO_VB_STATUS.approved && stStatus == context.oldRecord
                        .getValue('approvalstatus')) || stARN == constants.PO_VB_ARN.awaiting_submission))) {
                    log.debug(454);
                    // initiate/restart approval if approved
                    // submit on approvalstatus from 3-way match MR script triggers EDIT event - don't run this logic for this case
                    // don't run this logic if VB is already created as approved - Intercompany transformation (ERP13)
                    // PSR284 -> approval process shouldn't be restarted for Partner Transactions if edited

                    // replaced by field sourcing in UI, in CSV import doesn't work
                    var stRepresentsSub; // cannot be sourced directly, only as default value via formula (custbody_mf_represents_sub) and that value is not available before submit
                    if (isEmpty(objVendorData)) { // not looked up yet
                        stRepresentsSub = search.lookupFields({ // field doesn't source in CSV import
                            type : search.Type.VENDOR,
                            id : objNewTransaction.getValue('entity'),
                            columns : [ 'representingsubsidiary' ]
                        }).representingsubsidiary;
                    } else {
                        stRepresentsSub = objVendorData.representingsubsidiary;
                    }

                    if (runtime.executionContext == runtime.ContextType.CSV_IMPORT || context.type == context.UserEventType.EDIT) {
                        intRequestorId = objNewTransaction.getValue({
                            fieldId : 'custbody_mf_tran_requestor'
                        });

                        if (intRequestorId) {
                            objRequestorLookUp = search.lookupFields({
                                type : search.Type.EMPLOYEE,
                                id : intRequestorId,
                                columns : [ 'custentity_mf_employeeprocurementlevel', 'custentity_mf_procurementapprovalmatrix' ]
                            });

                            if (!isEmpty(objRequestorLookUp)) {
                                if (objRequestorLookUp.custentity_mf_employeeprocurementlevel[0]) {
                                    objNewTransaction.setValue({
                                        fieldId : 'custbody_mf_emp_procurement_level',
                                        value : objRequestorLookUp.custentity_mf_employeeprocurementlevel[0].value
                                    });
                                }
                                if (objRequestorLookUp.custentity_mf_procurementapprovalmatrix[0]) {
                                    objNewTransaction.setValue({
                                        fieldId : 'custbody_mf_procur_approval_matrix',
                                        value : objRequestorLookUp.custentity_mf_procurementapprovalmatrix[0].value
                                    });
                                }
                            }

                        }

                    }

                    // Defect 4454
                    objNewTransaction.setValue({
                        fieldId : 'custbody_mf_approved_by',
                        value : ''
                    });

                    //log.debug('BS custbody_mf_represents_sub', stRepresentsSub);

                    if (!isEmpty(stRepresentsSub)) {

                        var intSubsidiaryId = objNewTransaction.getValue({
                            fieldId : 'subsidiary'
                        });

                        var objSubsidiary = search.lookupFields({
                            type : search.Type.SUBSIDIARY,
                            id : intSubsidiaryId,
                            columns : [ 'custrecord_mf_intercompany_approver1', 'custrecord_mf_intercompany_approver2' ]
                        });

                        var stIcApprover = '';
                        if (!isEmpty(objSubsidiary) && objSubsidiary.custrecord_mf_intercompany_approver1[0]) {
                            stIcApprover = objSubsidiary.custrecord_mf_intercompany_approver1[0].value;

                            objNewTransaction.setValue({
                                fieldId : 'custbody_mf_next_approvers',
                                value : [ stIcApprover ]
                            });
                        } else {
                            var objError = error
                                .create({
                                    name : 'MISSING_IC_APPROVER_1',
                                    message : 'Selected Vendor is Intercompany Vendor. Please, contact Administrator to update missing Intercompany Approvers on the Subsidiary record',
                                    notifyOff : true
                                });
                            throw objError;
                            //throw 'MISSING_IC_APPROVER_1';
                        }

                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_approvalroutingnote',
                            value : constants.PO_VB_ARN.awaiting_intercompany_approval_1
                        });

                        // IC Approver 2 is optional
                        var stIcRoutingNote = '';
                        if (!isEmpty(objSubsidiary) && objSubsidiary.custrecord_mf_intercompany_approver2[0]) {
                            stIcRoutingNote = 'Intercompany Approver 1 > Intercompany Approver 2';
                        } else {
                            stIcRoutingNote = 'Intercompany Approver 1';
                        }

                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_approval_route',
                            value : stIcRoutingNote
                        });

                    } else {
                        //log.debug("awaiting submission");
                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_approvalroutingnote',
                            value : constants.PO_VB_ARN.awaiting_submission
                        });

                        objConfigRecord = record.load({
                            type : 'customrecord_mf_chart_of_approval_config',
                            id : APPROVAL_CONFIG_ID
                        });
                        log.debug('619');
                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_approval_route',
                            value : constants.buildApprovalRoute(objNewTransaction, objConfigRecord, record)
                        });

                    }

                }


                if (context.type == context.UserEventType.EDIT) {
                    log.debug("622");
                    var stOldStatus = context.oldRecord.getValue('approvalstatus');

                    if (stStatus == constants.PO_VB_STATUS.pending && stOldStatus == constants.PO_VB_STATUS.rejected) {
                        //re-submit
                        log.debug('resubmit objVendorData', objVendorData);
                        objVendorData = search.lookupFields({
                            type : search.Type.VENDOR,
                            id : objNewTransaction.getValue('entity'),
                            columns : [ 'custentity_osgt_screen_status' ]
                        });

                        if (!isEmpty(objVendorData) && objVendorData.custentity_osgt_screen_status[0]) {
                            var stOsgtStatus = objVendorData.custentity_osgt_screen_status[0].text;
                            if (stOsgtStatus == constants.OSGT_STATUS.on_hold) {
                                objNewTransaction.setValue('approvalstatus', constants.PO_VB_STATUS.rejected);
                                objNewTransaction.setValue('custbody_mf_approvalroutingnote', constants.PO_VB_ARN.rejected);
                                objNewTransaction.setValue('custbody_mf_rejection_reason', "Vendor's OSGT Status is Blocked");
                                objNewTransaction.setValue('custbody_mf_rejected_by', '');
                                objNewTransaction.setValue('custbody_mf_next_approvers', '');
                                objNewTransaction.setValue('custbody_mf_approval_role', '');
                                objNewTransaction.setValue('custbody_mf_add_approvers', '');
                                objNewTransaction.setValue('custbody_mf_current_app_level', '');
                                objNewTransaction.setValue('custbody_mf_approved_by', '');
                                objNewTransaction.setValue('custbody_mf_approval_audit_log', 'Auto-Rejected due to Blocked OSGT Status |');

                                return; // do not continue
                            }
                        }

                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_rejected_by',
                            value : ''
                        });

                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_rejection_reason',
                            value : ''
                        });

                        var stArn = objNewTransaction.getValue('custbody_mf_approvalroutingnote');
                        var stIcRoutingNote = '';

                        log.debug(`- arn ${stARN}`, [constants.PO_VB_ARN.awaiting_procurement_approval,constants.PO_VB_ARN.awaiting_tactical_sourcing_approval, constants.PO_VB_ARN.awaiting_supervisor_approval].includes(stARN));
                        if ([constants.PO_VB_ARN.awaiting_procurement_approval,constants.PO_VB_ARN.awaiting_tactical_sourcing_approval, constants.PO_VB_ARN.awaiting_supervisor_approval].includes(stARN) && isEmpty(objConfigRecord)) {
                            objConfigRecord = record.load({
                                type : 'customrecord_mf_chart_of_approval_config',
                                id : APPROVAL_CONFIG_ID
                            });
                        } else if (stArn == constants.PO_VB_ARN.awaiting_intercompany_approval_1) { // IC resubmission
                            var intSubsidiaryId = objNewTransaction.getValue({
                                fieldId : 'subsidiary'
                            });

                            var objSubsidiary = search.lookupFields({
                                type : search.Type.SUBSIDIARY,
                                id : intSubsidiaryId,
                                columns : [ 'custrecord_mf_intercompany_approver2' ]
                            });

                            // IC Approver 2 is optional

                            if (!isEmpty(objSubsidiary) && objSubsidiary.custrecord_mf_intercompany_approver2[0]) {
                                stIcRoutingNote = 'Intercompany Approver 1 > Intercompany Approver 2';
                            } else {
                                stIcRoutingNote = 'Intercompany Approver 1';
                            }
                        }

                        objNewTransaction.setValue({
                            fieldId : 'custbody_mf_approval_route',
                            value : stIcRoutingNote || constants.buildApprovalRoute(objNewTransaction, objConfigRecord, record)
                        });

                        /*if (bPartnerTran) {
                            routeViaChartOfApprovals(null, objNewTransaction, objConfigRecord);
                        } else {
                            var objOptions = {
                                arn : stArn,
                                requestor : objNewTransaction.getValue('custbody_mf_tran_requestor'),
                                subsidiary : objNewTransaction.getValue('subsidiary')
                            }
                            setInitialApprover(objNewTransaction, objConfigRecord, objOptions);
                        }*/

                        var objOptions = {
                            arn : stArn,
                            requestor : objNewTransaction.getValue('custbody_mf_tran_requestor'),
                            subsidiary : objNewTransaction.getValue('subsidiary')
                        }

                        setInitialApprover(objNewTransaction, objOptions);

                    }
                }

                if (objNewTransaction.type == record.Type.PURCHASE_ORDER && context.type == context.UserEventType.EDIT
                    && !(stStatus == constants.PO_VB_STATUS.approved && stStatus != context.oldRecord.getValue('approvalstatus'))) { // not changed to approved
                    // prevent from triggering when super-approved
                    // this will still trigger for Partner transactions

                    /*var objPOQuery = query.create({
                        type : query.Type.TRANSACTION
                    });
                    objPOQuery.columns = [ objPOQuery.createColumn({
                        fieldId : 'type'
                    }) ];
                    var objJoinTranLine = objPOQuery.autoJoin({
                        fieldId : 'transactionlines'
                    });
                    // First Group
                    var objCond01 = objPOQuery.createCondition({
                        fieldId : 'type',
                        operator : query.Operator.ANY_OF,
                        values : [ 'VendBill' ]
                    });
                    var objCond02 = objJoinTranLine.createCondition({
                        fieldId : 'createdfrom',
                        operator : query.Operator.ANY_OF,
                        values : [ objNewTransaction.id ]
                    });
                    var objCond03 = objJoinTranLine.createCondition({
                        fieldId : 'mainline',
                        operator : query.Operator.IS,
                        values : [ true ]
                    });
                    var objCond04 = objPOQuery.createCondition({
                        fieldId : 'status',
                        operator : query.Operator.ANY_OF,
                        values : [ 'VendBill:D' ]
                    });
                    // Second Group
                    var objCond05 = objPOQuery.createCondition({
                        fieldId : 'type',
                        operator : query.Operator.ANY_OF,
                        values : [ 'ItemRcpt' ]
                    });
                    var objCond06 = objJoinTranLine.createCondition({
                        fieldId : 'mainline',
                        operator : query.Operator.IS,
                        values : [ true ]
                    });
                    var objCond07 = objJoinTranLine.createCondition({
                        fieldId : 'createdfrom',
                        operator : query.Operator.ANY_OF,
                        values : [ objNewTransaction.id ]
                    });
                    // Condition Build
                    objPOQuery.condition = objPOQuery.or(objPOQuery.and(objCond01, objCond02, objCond03, objCond04), objPOQuery.and(objCond05,
                            objCond06, objCond07));
                    var objPagedData = objPOQuery.runPaged({
                        pageSize : 1000
                    });*/

                    var boolVBFound = false;
                    var boolIRFound = false;

                    var transactionSearchObj = search.create({
                        type : "transaction",
                        filters : [ [ [ [ "type", "anyof", "VendBill" ],
                            "AND",
                            [ "createdfrom", "anyof", objNewTransaction.id ],
                            "AND",
                            [ "status", "anyof", "VendBill:D" ] ],
                            "OR",
                            [ [ "type", "anyof", "ItemRcpt" ], "AND", [ "createdfrom", "anyof", objNewTransaction.id ] ] ],
                            "AND",
                            [ "mainline", "is", "T" ] ],
                        columns : [ search.createColumn({
                            name : "type",
                            label : "Type"
                        }) ]
                    });

                    var arrResults = [];
                    transactionSearchObj.run().each(function(result) {
                        // .run().each has a limit of 4,000 results
                        arrResults.push(result);
                        return true;
                    });

                    for (var i = 0; i < arrResults.length; i++) {
                        if (arrResults[i].type == 'VendBill') {
                            boolVBFound = true;
                        }
                        if (arrResults[i].type == 'ItemRcpt') {
                            boolIRFound = true;
                        }

                        if (boolVBFound && boolIRFound) {

                            objNewTransaction.setValue({
                                fieldId : 'custbody_mf_pending_3way_matching',
                                value : true
                            });

                            break;

                        }

                    }

                    /*if (objPagedData.count > 0) {
                        var arrResults = [];
                        objPagedData.pageRanges.forEach(function(pageRange) {
                            var objPage = objPagedData.fetch({
                                index : pageRange.index
                            }).data;
                            // map results to columns
                            arrResults.push.apply(arrResults, objPage.results.map(function(result) {
                                return mf_lib.mapResultsToColumns(result, objPage);
                            }));
                        });
                        for (var i = 0; i < arrResults.length; i++) {
                            if (arrResults[i].type == 'vendorbill') {
                                boolVBFound = true;
                            }
                            if (arrResults[i].type == 'itemreceipt') {
                                boolIRFound = true;
                            }
                            if (boolVBFound && boolIRFound) {
                                objNewTransaction.setValue({
                                    fieldId : 'custbody_mf_pending_3way_matching',
                                    value : true
                                });
                                break;
                            }
                        }
                    }*/

                }

                if (context.type == context.UserEventType.XEDIT && bApprovalUpdate) {

                    var objOldRecord = context.oldRecord;
                    var objNewRecord = context.newRecord;

                    /*//log.debug({
                        title : 'XEDIT old',
                        details : objOldRecord
                    });
                    //log.debug({
                        title : 'XEDIT new',
                        details : objNewRecord
                    });*/

                    objConfigRecord = record.load({
                        type : 'customrecord_mf_chart_of_approval_config',
                        id : APPROVAL_CONFIG_ID
                    });

                    var intOldApprovalRoutingNoteId = objOldRecord.getValue({
                        fieldId : 'custbody_mf_approvalroutingnote'
                    });

                    var intNewApprovalRoutingNoteId = objNewRecord.getValue({
                        fieldId : 'custbody_mf_approvalroutingnote'
                    });

                    var arrNewNextApprover = objNewRecord.getValue({
                        fieldId : 'custbody_mf_next_approvers'
                    });
                    var arrOldNextApprover = objOldRecord.getValue({
                        fieldId : 'custbody_mf_next_approvers'
                    });

                    intRequestorId = objOldRecord.getValue({
                        fieldId : 'custbody_mf_tran_requestor'
                    });

                    if (objNewRecord.type == record.Type.PURCHASE_ORDER && intOldApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_submission
                        && ((intNewApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_procurement_approval) || (intNewApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_tactical_sourcing_approval))) {
                        // submission
                        log.debug('904');
                        if(intNewApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_procurement_approval)
                        {
                            setInitialApprover(objNewRecord, {
                                arn : constants.PO_VB_ARN.awaiting_procurement_approval
                            });
                        }
                        else
                        {
                             setInitialApprover(objNewRecord, {
                                arn : constants.PO_VB_ARN.awaiting_tactical_sourcing_approval
                            });
                        }

                    } else if (objNewRecord.type == record.Type.PURCHASE_ORDER
                        && (intOldApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_procurement_approval || intOldApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_tactical_sourcing_approval )
                        && isEmpty(intNewApprovalRoutingNoteId)) {
                            log.debug('intNewApprovalRoutingNoteId',intNewApprovalRoutingNoteId);
                            log.debug('intOldApprovalRoutingNoteId',intOldApprovalRoutingNoteId);
                            
                        var intPOItemCategory = objOldRecord.getValue({
                            fieldId : 'custbody_mf_po_item_category'
                        });

                        var boolLineFound = false;

                        var objLineDetails = {};

                        var intLine = objConfigRecord.findSublistLineWithValue({
                            sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
                            fieldId : 'custrecord_mf_item_cat_role_category',
                            value : intPOItemCategory
                        });

                        if (intLine != -1) {
                            objLineDetails.flSublistLimit = parseFloat(objConfigRecord.getSublistValue({
                                sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
                                fieldId : 'custrecord_mf_item_cat_role_greater_than',
                                line : intLine
                            })) || 0;

                            objLineDetails.intSublistApproverRole = objConfigRecord.getSublistValue({
                                sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
                                fieldId : 'custrecord_mf_item_cat_role_approverrole',
                                line : intLine
                            });

                            objLineDetails.intSublistlevel = objConfigRecord.getSublistValue({
                                sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
                                fieldId : 'custrecord_mf_item_cat_role_routing_lvl',
                                line : intLine
                            });

                            boolLineFound = true;
                        }

                        //log.debug('objLineDetails', objLineDetails);

                        var bRiskAssessment = false;
                        for ( var i in constants.RISK_ASSESSMENT_FLD) {
                            bRiskAssessment = objOldRecord.getValue({
                                fieldId : constants.RISK_ASSESSMENT_FLD[i]
                            });
                            if (bRiskAssessment) {
                                break;
                            }
                        }

                        if (!boolLineFound
                            || (boolLineFound && (parseFloat(objOldRecord.getValue('custbody_mf_usd_amount')) <= objLineDetails.flSublistLimit && !bRiskAssessment))) {

                            intRequestorId = objOldRecord.getValue({
                                fieldId : 'custbody_mf_tran_requestor'
                            });

                            var arrAleadyApproved = objNewRecord.getValue('custbody_mf_approved_by').split(',');
                            var stSupervisor = '';

                            if (intRequestorId) {
                                objRequestorLookUp = search.lookupFields({
                                    type : search.Type.EMPLOYEE,
                                    id : intRequestorId,
                                    columns : [ 'supervisor' ]
                                });

                                if (!isEmpty(objRequestorLookUp) && objRequestorLookUp.supervisor[0]) {
                                    stSupervisor = objRequestorLookUp.supervisor[0].value;
                                }
                            }
                            log.debug("---");
                            if (stSupervisor && arrAleadyApproved.indexOf(stSupervisor) == -1) {
                                log.debug("setting supervisor approval routing note");
                                objNewRecord.setValue({
                                    fieldId : 'custbody_mf_approvalroutingnote',
                                    value : constants.PO_VB_ARN.awaiting_supervisor_approval
                                });

                                objNewRecord.setValue({
                                    fieldId : 'custbody_mf_next_approvers',
                                    value : [ stSupervisor ]
                                });

                            } else {

                                routeViaChartOfApprovals(objOldRecord, objNewRecord, objConfigRecord); // 4e

                            }

                        } else {

                            objNewRecord.setValue({
                                fieldId : 'custbody_mf_approvalroutingnote',
                                value : objLineDetails.intSublistlevel
                            });

                            objNewRecord.setValue({
                                fieldId : 'custbody_mf_approval_role',
                                value : objLineDetails.intSublistApproverRole
                            });

                        }
                    } else if (intOldApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_supervisor_approval
                        && isEmpty(intNewApprovalRoutingNoteId)) {

                        routeViaChartOfApprovals(objOldRecord, objNewRecord, objConfigRecord); // 4e

                    } else if (intRequestorId && intNewApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_supervisor_approval
                        && intOldApprovalRoutingNoteId != intNewApprovalRoutingNoteId) {

                        setInitialApprover(objNewRecord, {
                            arn : constants.PO_VB_ARN.awaiting_supervisor_approval,
                            requestor : intRequestorId
                        })

                    } else if (intNewApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_intercompany_approval_2
                        && intOldApprovalRoutingNoteId != intNewApprovalRoutingNoteId) {

                        var intSubsidiaryId = objOldRecord.getValue({
                            fieldId : 'subsidiary'
                        });

                        var objSubsidiary = search.lookupFields({
                            type : search.Type.SUBSIDIARY,
                            id : intSubsidiaryId,
                            columns : [ 'custrecord_mf_intercompany_approver2' ]
                        });
                        var stIcApprover = '';
                        if (!isEmpty(objSubsidiary) && objSubsidiary.custrecord_mf_intercompany_approver2[0]) {
                            stIcApprover = objSubsidiary.custrecord_mf_intercompany_approver2[0].value;

                            objNewRecord.setValue({
                                fieldId : 'custbody_mf_next_approvers',
                                value : [ stIcApprover ]
                            });
                        } else {
                            //throw 'MISSING_IC_APPROVER_2';
                            // IC Approver 2 is optional, if missing then approve
                            objNewRecord.setValue({
                                fieldId : 'custbody_mf_next_approvers',
                                value : []
                            });

                            objNewRecord.setValue({
                                fieldId : 'custbody_mf_approvalroutingnote',
                                value : constants.PO_VB_ARN.completed
                            });
                        }

                    } else if (intOldApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_intercompany_approval_2
                        && isEmpty(intNewApprovalRoutingNoteId) && isEmpty(arrNewNextApprover)) {

                        objNewRecord.setValue({
                            fieldId : 'custbody_mf_approvalroutingnote',
                            value : constants.PO_VB_ARN.completed
                        });

                    } else if (intOldApprovalRoutingNoteId == constants.PO_VB_ARN.awaiting_3way_matching_approval
                        && isEmpty(intNewApprovalRoutingNoteId) && isEmpty(arrNewNextApprover)) {

                        objNewRecord.setValue({
                            fieldId : 'custbody_mf_approvalroutingnote',
                            value : constants.PO_VB_ARN.completed
                        });

                    } else if (JSON.stringify(arrNewNextApprover) != JSON.stringify(arrOldNextApprover)) {

                        if (!isEmpty(arrNewNextApprover) || intNewApprovalRoutingNoteId == constants.PO_VB_ARN.rejected) {
                            // do nothing
                        } else {

                            var intOldLevel = objOldRecord.getValue({
                                fieldId : 'custbody_mf_current_app_level'
                            });
                            //log.debug('intOldLevel', intOldLevel);

                            var flOldUSDAmt = objOldRecord.getValue({
                                fieldId : 'custbody_mf_usd_amount'
                            });

                            var stOldAddApprovers = objOldRecord.getValue({
                                fieldId : 'custbody_mf_add_approvers' // string
                            });

                            var stMatrix = objOldRecord.getValue({
                                fieldId : 'custbody_mf_procur_approval_matrix'
                            });

                            var stRequestor = objOldRecord.getValue({
                                fieldId : 'custbody_mf_tran_requestor'
                            });

                            var stEmpProcLvl = objOldRecord.getValue({
                                fieldId : 'custbody_mf_emp_procurement_level'
                            });

                            goToNextLevel(objNewRecord, flOldUSDAmt, intOldLevel, objConfigRecord, stOldAddApprovers, stMatrix, stRequestor,
                                stEmpProcLvl);

                        }

                    }

                }
            } catch (e) {
                customLog(e);
                if (e.name == 'MISSING_IC_APPROVER_1') {
                    if (runtime.executionContext == runtime.ContextType.CSV_IMPORT) {
                        throw e.message;
                    } else {
                        throw e;
                    }

                }
            }

            //log.debug('BEFORE SUBMIT', '---END---');

        }

        function afterSubmit_approvalRouting(context) {

            //log.debug('AFTER SUBMIT', '---START---');
            //log.debug('AS type', context.type);

            try {
              log.debug('Entered afterSubmit');

                var objScript = runtime.getCurrentScript();

                var recTran = context.newRecord;
                var recOldTran = context.oldRecord;
                var bContinue = true; // ready for script merging

                var stNextApprover = recTran.getValue('custbody_mf_next_approvers');
                var stOldNextApprover = '';
                var stApproverRole = recTran.getValue('custbody_mf_approval_role');
                var stOldApproverRole = '';
                var stStatus = recTran.getValue('approvalstatus');
                var stOldStatus = '';
                var stARN = recTran.getValue('custbody_mf_approvalroutingnote'); // Approval Routing Status
                var stOldARN = '';
                var bPartnerTran = recTran.getValue('custbody_mf_partnertransaction');
                var intTemplate;
                var int3Way = null;

                log.debug('AS', "------------------");
                log.debug("created from", recTran.getValue("createdFrom"));
                log.debug("created from", recTran.getLineCount("purchaseorders"));
                log.debug("created from", recTran.getLineCount("purchaseorders"));
                log.debug('partner transaction', bPartnerTran);

                // Defect 18015 -> If EDIT on open VB -> don't send for approval
                if (context.type == context.UserEventType.EDIT && recTran.type == record.Type.VENDOR_BILL && recTran.getValue('status') == 'Open')
                {
                    return;
                }
                
                //Start: Code Added 12 july 2021
                log.debug("Start New code =>", 'Line Number 1203');
                if (context.type == context.UserEventType.EDIT && recTran.type == record.Type.VENDOR_BILL)
                {
                    var oldRecordApprovalNotes = recOldTran.getValue('custbody_mf_approvalroutingnote');
                    log.debug("Old Record Approval Notes", oldRecordApprovalNotes);
                    
                    var newRecordApprovalNotes = recTran.getValue('custbody_mf_approvalroutingnote');
                    log.debug("New Record Approval Notes", newRecordApprovalNotes);
                    
                    var newstSFOrder = recTran.getValue('custbody_mf_sf_order_internal_id');
                    log.debug("New Record newstSFOrder", newstSFOrder);
                    
                    var oldStSFOrder = recOldTran.getValue('custbody_mf_sf_order_internal_id');
                    log.debug("New Record oldStSFOrder", oldStSFOrder);
                    
                    if(oldRecordApprovalNotes == 19 && newRecordApprovalNotes == 18 )
                        {
                           try { 
                                    var stArn = recTran.getValue('custbody_mf_approvalroutingnote');
                                    var bRejectOnly = (stArn == constants.PO_VB_ARN.awaiting_3way_matching_rejection);
                                    
                                    mf_lib.sendApprovalEmail(recTran, false, true, true, null, bRejectOnly); //html = false, pdf = true, delegate = true, roleBased = argument value
                                    log.debug("Email Sent Line 1225", recTran);
                                    } catch (e) {
                                    if (e.name == 'UNEXPECTED_ERROR') {
                                        throw 'MISSING_EMP_EMAIL';
                                        //throw 'One or more approvers don\'t have an Email address set on their Employee record. The Email cannot be sent';
                                    } else {
                                        throw e;
                                    }
                                }
                        }
                    //For Back bill email trigger   
                    if(newstSFOrder == "Trigger Email" && oldStSFOrder == '' )
                    {
                        try { 
                                    var stArn = recTran.getValue('custbody_mf_approvalroutingnote');
                                    var bRejectOnly = (stArn == constants.PO_VB_ARN.awaiting_3way_matching_rejection);
                                    
                                    mf_lib.sendApprovalEmail(recTran, false, true, true, null, bRejectOnly); //html = false, pdf = true, delegate = true, roleBased = argument value
                                    log.debug("Email Sent Line 1243", recTran);
                            } catch (e) {
                            if (e.name == 'UNEXPECTED_ERROR') {
                                throw 'MISSING_EMP_EMAIL';
                                //throw 'One or more approvers don\'t have an Email address set on their Employee record. The Email cannot be sent';
                            } else {
                                throw e;
                            }
                        }
                    }
                    
                }
                log.debug("End New code=>", 'Line number 1254');
                //End: Code Added 12 july 2021
                
                //source the transaction number and assign it to the tranid
                if (!recTran.getValue("tranid")&&recTran.getValue("transactionnumber")){
                    log.debug("empty tranid");
                    //it is necessary to refresh the fields, because the scriptcontext.newrecord contains the old values
                    var searchTranid = search.lookupFields({id: recTran.id, type: recTran.type, columns: ['transactionnumber']});
                    submitValues(recTran.type, recTran.id, {tranid: searchTranid.transactionnumber});

                }


                if (context.type == context.UserEventType.CREATE && stARN == constants.PO_VB_ARN.rejected) {
                    var stRejReason = recTran.getValue('custbody_mf_rejection_reason');
                    emailApproval('rejected', recTran, null, stRejReason, null, false, null);
                    return;
                }

                if (context.type != context.UserEventType.CREATE) {

                    stOldNextApprover = recOldTran.getValue('custbody_mf_next_approvers');
                    stOldApproverRole = recOldTran.getValue('custbody_mf_approval_role');
                    stOldStatus = recOldTran.getValue('approvalstatus');
                    stOldARN = recOldTran.getValue('custbody_mf_approvalroutingnote');

                    // prevent triggering XEDIT logic when PO is being updated by 3-way match Map/Reduce script
                    var bApprovalUpdate = false;
                    if (context.type == context.UserEventType.XEDIT) {

                        var stApprovedBy = recTran.getValue('custbody_mf_approved_by');
                        var stOldApprovedBy = recOldTran.getValue('custbody_mf_approved_by');
                        var bApprovedByChanged = stApprovedBy && stApprovedBy != stOldApprovedBy;

                        var stArn = recTran.getValue('custbody_mf_approvalroutingnote');
                        var stOldArn = recOldTran.getValue('custbody_mf_approvalroutingnote');
                        var bArnChanged = stArn && (stArn != stOldArn) && (stArn != constants.PO_VB_ARN.discarded);

                        bApprovalUpdate = bApprovedByChanged || bArnChanged;

                    }
                    //log.debug('bApprovalUpdate', bApprovalUpdate);

                    var objSubmitValues = {};

                    if (context.type == context.UserEventType.EDIT && stStatus == constants.PO_VB_STATUS.approved && stStatus == stOldStatus
                        && runtime.executionContext != runtime.ContextType.WEBSERVICES && !recTran.getValue("custbody_mf_partnertransaction")) {
                        // restart approval, other values set in BeforeSubmit
                        // don't restart if the Bill is approved by 3-way match MR script
                        log.debug("resetting approval");

                        if (recTran.getValue('status') != 'Open')
                        {
                            objSubmitValues.approvalstatus = constants.PO_VB_STATUS.pending;
                            // objSubmitValues.custbody_mf_approvalroutingnote = constants.PO_VB_ARN.awaiting_submission;
                            submitValues(recTran.type, recTran.id, objSubmitValues);
                        }
                    } else if ((context.type == context.UserEventType.XEDIT && bApprovalUpdate) || (context.type == context.UserEventType.EDIT)) {

                        //log.debug(1186);
                        //log.debug("stARN " + stARN, "constants.PO_VB_ARN.completed "+ constants.PO_VB_ARN.completed);
                        //log.debug("stOldARN", stOldARN);
                        if (stARN == constants.PO_VB_ARN.completed && stARN != stOldARN && stStatus != constants.PO_VB_STATUS.approved) { // if not already approved from 3-way match MR or super-approved
                            objSubmitValues.approvalstatus = constants.PO_VB_STATUS.approved;
                            objSubmitValues.custbody_mf_date_approval = new Date();
                            submitValues(recTran.type, recTran.id, objSubmitValues); // first submit, then email
                            var arrApprovedBy = recTran.getValue('custbody_mf_approved_by').split(',');
                            var stLastApprover = arrApprovedBy[arrApprovedBy.length - 1];
                            emailApproval('approved', recOldTran, stLastApprover, null, null, true, null); // to requestor
                            if (recTran.type == record.Type.VENDOR_BILL) {
                                // send email to Vendor, from Requestor, use template Vendor Bill Advise
                                intTemplate = parseInt(objScript.getParameter('custscript_vendor_bill_advise_temp'));
                                emailApproval('vendor', recOldTran, null, null, null, true, intTemplate);
                            } else if (recTran.type == record.Type.PURCHASE_ORDER && !bPartnerTran) {
                                intTemplate = parseInt(objScript.getParameter('custscript_trade_vendor_temp')); // PSR284 Partner Management Email Templates
                                emailApproval('vendor_po', recOldTran, stLastApprover, null, null, true, intTemplate);
                            }
                            bContinue = false;
                        } else if (stARN == constants.PO_VB_ARN.rejected && stARN != stOldARN) {
                            var stRejectedBy = recTran.getValue('custbody_mf_rejected_by');
                            var stRejReason = recTran.getValue('custbody_mf_rejection_reason');
                            var stPendingReject = false;
                            stPendingReject = recTran.getValue('custbody_pending_3way');
                            if (stPendingReject == true) {}else{
                                emailApproval('rejected', recOldTran, stRejectedBy, stRejReason, null, true, null);
                            }
                            bContinue = false;
                        } else if ((!isEmpty(stNextApprover) && stOldNextApprover.indexOf(stNextApprover[0]) == -1)
                            || (stApproverRole && stApproverRole != stOldApproverRole)) {
                            // send email to new list of approvers if Next Approvers are updated and are not subset of old Next Approvers or Approver role is updated
                            //log.debug('stNextApprover', stNextApprover);
                            //var stRoleBased = (stNextApprover.length != 0 && stNextApprover != -1) ? '' : 'custbody_mf_approval_role';
                            var stRoleBased = (!isEmpty(stNextApprover)) ? '' : 'custbody_mf_approval_role';
                            var stRole = recTran.getValue('custbody_mf_approval_role');
                            //log.debug('stRoleBased', stRoleBased);

                            if (context.type == context.UserEventType.EDIT) {
                                if ((stRoleBased && stRole) || !stRoleBased) {
                                    emailApproval('pending', recTran, null, null, stRoleBased, true, null);
                                }
                            } else {
                                // in XEDIT there are only updated values in newRecord
                                // mf_lib.sendApprovalEmail needs both updated values and values which are not updated -> can't use newRecord nor oldRecord

                                var objTran = search.lookupFields({
                                    type : recTran.type,
                                    id : recTran.id,
                                    columns : [ 'custbody_mf_next_approvers',
                                        'custbody_mf_tran_requestor',
                                        'tranid',
                                        'transactionnumber',
                                        'custbody_mf_approval_role' ]
                                });

                                if (!isEmpty(objTran)) {
                                    var stRequestor = '';
                                    if (objTran.custbody_mf_tran_requestor[0]) {
                                        stRequestor = objTran.custbody_mf_tran_requestor[0].value;
                                    }

                                    var stApprovalRole = '';
                                    if (objTran.custbody_mf_approval_role[0]) {
                                        stApprovalRole = objTran.custbody_mf_approval_role[0].value;
                                    }

                                    var arrApprovers = [];
                                    for (var i = 0; i < objTran.custbody_mf_next_approvers.length; i++) {
                                        arrApprovers.push(objTran.custbody_mf_next_approvers[i].value);
                                    }

                                    var objRec = {
                                        id : recTran.id,
                                        type : recTran.type,
                                        tranid : objTran.tranid,
                                        transactionnumber : objTran.transactionnumber,
                                        custbody_mf_tran_requestor : stRequestor,
                                        custbody_mf_next_approvers : arrApprovers,
                                        custbody_mf_approval_role : stApprovalRole,
                                        custbody_mf_approvalroutingnote : recTran.getValue('custbody_mf_approvalroutingnote'), // ARN is available in newRecord
                                        getValue : function(field) {
                                            return this[field];
                                        }
                                    };
                                    //log.debug('objRec', objRec);
                                    if ((stRoleBased && stRole) || !stRoleBased) {
                                        emailApproval('pending', objRec, null, null, stRoleBased, true, null);
                                    }
                                }

                            }
                            bContinue = false;
                        }

                    }
                }

                if (recTran.type == record.Type.VENDOR_BILL
                    && (context.type == context.UserEventType.CREATE || (context.type == context.UserEventType.XEDIT && bContinue && stStatus != constants.PO_VB_STATUS.approved))) {
                    // prevent from triggering when status is changed (EDIT) to Approved via 3-way match MR
                    // Defect 8773: don't restart 3-way matching if already approved
                    var stBillId = recTran.id;

                    var stSearch = objScript.getParameter({
                        name : 'custscript_chart_of_approvals_search'
                    }); // expects customsearch_mf_eerp34_chart_of_approval -> query doesn't support this kind of search yet (still in BETA)
                    if (!stSearch) {
                        throw 'MISSING_SEARCH_PARAM';
                    }
                    // search cannot be scripted because this Saved Search uses "Consolidated Exchange Rate = None" preference
                    var objSearch = search.load({
                        id : stSearch
                    });
                    var objFilter = search.createFilter({
                        name : 'billingtransaction',
                        operator : search.Operator.ANYOF,
                        values : stBillId
                    });
                    objSearch.filters.push(objFilter);

                    var arrPoResults = [];
                    var objPagedSearch = objSearch.runPaged({
                        pageSize : 5
                    });
                    if (objPagedSearch.pageRanges.length > 0) {
                        var objSearchData = objPagedSearch.fetch({
                            index : objPagedSearch.pageRanges[0].index
                        });
                        arrPoResults = objSearchData.data;
                    }

                    var objSubmitValues = {};

                    var intIrCount = 0;
                    // multiple PO on one Bill ---START
                    // if Bill Purchase Order page is used to create single bill for multiple POs
                    /*if (arrPoResults.length > 0) {
                        var arrRelatedPo = [];
                        var flRelatedPoTotal = 0;
                        var arrRelatedPoTxt = [];
                        var stRelatedPoTxt = '';
                        arrPoResults.forEach(function(result) {
                            var stPoId = result.getValue({
                                name : 'internalid',
                                summary : search.Summary.GROUP
                            });
                            arrRelatedPo.push(stPoId);
                            intIrCount += parseInt(result.getValue({
                                name : 'formulatext',
                                summary : search.Summary.COUNT
                            })) || 0;
                            arrRelatedPoTxt.push(result.getValue({
                                name : 'tranid',
                                summary : search.Summary.GROUP
                            }));
                            flRelatedPoTotal += parseFloat(result.getValue({
                                name : 'total',
                                summary : search.Summary.MAX
                            })) || 0;
                        });
                        //objSubmitValues.custbody_mf_rel_po_id = arrRelatedPo; // TODO change custbody_mf_rel_po_id to multiselect
                        objSubmitValues.custbody_mf_rel_po_ref = arrRelatedPoTxt.join(', '); // TODO change to long text
                        objSubmitValues.custbody_mf_rel_po_total = flRelatedPoTotal;
                        if (context.type == context.UserEventType.CREATE && stStatus == constants.PO_VB_STATUS.approved) {
                            objSubmitValues.custbody_mf_approvalroutingnote = constants.PO_VB_ARN.completed; // Intercompany transformation ERP13
                        } else {
                            objSubmitValues.custbody_mf_approvalroutingnote = constants.PO_VB_ARN.awaiting_3way_matching_auto;
                            objSubmitValues.custbody_mf_approval_route = 'Requestor';
                        }
                        if (!(context.type == context.UserEventType.CREATE && stStatus == constants.PO_VB_STATUS.approved)) {
                            if (intIrCount != 0 && arrRelatedPo.length > 1) {
                                objSubmitValues.custbody_mf_mark_related_po = true; // TODO new checkbox field
                            }
                        }
                        submitValues(recTran.type, recTran.id, objSubmitValues); // first submit, then email
                        // if NOT Intercompany transformation
                        if (!(context.type == context.UserEventType.CREATE && stStatus == constants.PO_VB_STATUS.approved)) {
                            if (intIrCount != 0 && arrRelatedPo.length > 0) { // Item receipts exist
                                if (arrRelatedPo.length < 10) {
                                    arrRelatedPo.forEach(function(poId) {
                                        submitValues(record.Type.PURCHASE_ORDER, poId, { // 10 units
                                            custbody_mf_pending_3way_matching : true
                                        });
                                    });
                                } else {
                                    //schedule a MR script to off-load PO updating
                                    // get input: search bills where custbody_mf_mark_related_po = true, return Bill ID and custbody_mf_rel_po_id.id
                                    // map: on each PO (custbody_mf_rel_po_id.id), set custbody_mf_pending_3way_matching : true, write Bill ID into context
                                    // reduce: set custbody_mf_mark_related_po : false on VB
                                    // ----------------OR--------------------
                                    // do a 3-way matching straight ahead for all bills where custbody_mf_mark_related_po = true which means there is more than 1 related PO
                                }
                            } else {
                                // send email to requestor
                                emailApproval('3way', recTran, null, objSubmitValues, null, true, null);
                            }
                        }
                    }*/
                    // multiple PO on one Bill ---END
                    if (arrPoResults.length == 1) {
                        int3Way = true;
                        var stPoId = arrPoResults[0].getValue({
                            name : 'internalid',
                            summary : search.Summary.GROUP
                        });
                        intIrCount = parseInt(arrPoResults[0].getValue({
                            name : 'formulatext',
                            summary : search.Summary.COUNT
                        })) || 0;
                        //log.debug('intIrCount', intIrCount);

                        objSubmitValues.custbody_mf_rel_po_id = stPoId;
                        objSubmitValues.custbody_mf_rel_po_ref = arrPoResults[0].getValue({
                            name : 'tranid',
                            summary : search.Summary.GROUP
                        });
                        objSubmitValues.custbody_mf_rel_po_total = arrPoResults[0].getValue({
                            name : 'total',
                            summary : search.Summary.MAX
                        });

                        if (context.type == context.UserEventType.CREATE && stStatus == constants.PO_VB_STATUS.approved) {
                            objSubmitValues.custbody_mf_approvalroutingnote = constants.PO_VB_ARN.completed; // Intercompany transformation ERP13
                        }
                        else
                        {
                            log.debug('frm map/reduce', constants.PO_VB_ARN.awaiting_3way_matching_auto)
                            objSubmitValues.custbody_mf_approvalroutingnote = constants.PO_VB_ARN.awaiting_3way_matching_auto;
                            objSubmitValues.custbody_mf_approval_route = 'Requestor';

                        }

                        submitValues(recTran.type, recTran.id, objSubmitValues); // first submit, then email

                        // if NOT Intercompany transformation
                        if (!(context.type == context.UserEventType.CREATE && stStatus == constants.PO_VB_STATUS.approved)) {
                            if (intIrCount != 0 && stPoId) { // Item receipts exist
                                submitValues(record.Type.PURCHASE_ORDER, stPoId, { // this has to be offloaded to MR for multiple POs to update
                                    custbody_mf_pending_3way_matching : true
                                }); // first submit, then email

                            } else {
                                // send email to requestor
                                emailApproval('3way', recTran, null, objSubmitValues, null, true, null);
                            }
                        }

                    }
                }
                if (context.type == context.UserEventType.CREATE &&  bPartnerTran && !int3Way){

                    log.debug("auto approving partner transaction");
                    stStatus = constants.PO_VB_STATUS.approved;
                    submitValues(recTran.type, recTran.id, {
                        custbody_mf_approvalroutingnote: constants.PO_VB_ARN.completed,
                        approvalstatus: constants.PO_VB_STATUS.approved,
                        custbody_mf_date_approval: new Date()
                    });
                }
              log.debug('context.type', context.type);

                // PSR284 Partner Management Email Templates
                if (context.type == context.UserEventType.CREATE && stStatus == constants.PO_VB_STATUS.approved && bPartnerTran) {
                  try{
                    var stDealReg = recTran.getValue('custbody_mf_deal_reg_id');
                  
                  log.debug('entered', 'inside');

                    if (stDealReg) {
                        intTemplate = parseInt(objScript.getParameter('custscript_deal_reg_temp'));
                    } else {
                        intTemplate = parseInt(objScript.getParameter('custscript_mdf_temp'));
                    }

                    if(recTran.type == record.Type.PURCHASE_ORDER && stDealReg) {
                        emailApproval('vendor_po', recTran, null, null, null, true, intTemplate);
                    }
                    else if (recTran.type == record.Type.PURCHASE_ORDER)
                    {
                      log.debug('entered else if', 'inside else if');
                      // Send email only if PO is of MDF type
                      var legacy = recTran.getValue('custbody_mf_legacyponum');
                      log.debug('legacy', legacy);
                      var isMDF = false;
                      if (legacy[0] == 'M' && legacy[1] == 'D' && legacy[2] == 'F') {
                        isMDF = true;
                      }
                      log.debug('isMDF', isMDF);
                      if(isMDF){
                        log.debug('entered mdf');
                        emailApproval('vendor_po_mdf', recTran, null, null, null, true, intTemplate);
                        log.debug('isMDF 2', isMDF);
                      }
                    }
                    return;
                }
                  catch(e){
                    log.error('error inside if', e);
                    log.debug('inside catch');
                  }
                }
            } catch (e) {
                customLog(e);
                if (e == 'MISSING_EMP_EMAIL') {
                    throw e;
                }
            }

            //log.debug('AFTER SUBMIT', '---END---');
        }

        // SUPP0RT FUNCTIONS

        /**
         * Validation function do determine if variable is empty or not.
         *
         * @param {Object}
         *            stValue
         * @returns {boolean} Return true if record is empty
         *
         * @since 2015.2
         */
        function isEmpty(stValue) {
            return ((stValue === '' || stValue == null || stValue == undefined) || (stValue.constructor === Array && stValue.length == 0) || ((stValue.constructor === Object || typeof stValue == 'object') && (function(
                v) {
                for ( var k in v)
                    return false;
                return true;
            })(stValue)));
        }

        function convertToUSD(recTran) {

            var flTotal = parseFloat(recTran.getValue('total')) || 0;
            var flTaxTotal = parseFloat(recTran.getValue('taxtotal')) || 0;
            var flNet = flTotal - flTaxTotal;
            var dtTranDate = recTran.getValue('trandate');
            var stCurrency = recTran.getValue('currency');

            var flRate = currency.exchangeRate({
                source : stCurrency,
                target : 'USD',
                date : dtTranDate
            });

            var flUsdAmount = flNet * flRate;

            return flUsdAmount;
        }

        function submitValues(type, id, values) {
            if (!isEmpty(values)) {
                record.submitFields({
                    type : type,
                    id : id,
                    values : values,
                    options : {
                        enablesourcing : false,
                        ignoreMandatoryFields : true
                    }
                });
                //log.debug(type + ':' + id + ' updated', values);
            }
        }

        // function buildApprovalRoute(objTran, objConfigRecord) {
        //     var stApprovalRoute = '';
        //     var flUsdAmount = parseFloat(objTran.getValue('custbody_mf_usd_amount')) || 0;
        //     var bPartnerTran = objTran.getValue('custbody_mf_partnertransaction');
        //
        //     if (objTran.type == record.Type.PURCHASE_ORDER && !bPartnerTran) {
        //         // if not partner
        //         stApprovalRoute += 'Procurement Operations > ';
        //
        //         var stItemCategory = objTran.getValue('custbody_mf_po_item_category');
        //
        //         var intLine = objConfigRecord.findSublistLineWithValue({
        //             sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
        //             fieldId : 'custrecord_mf_item_cat_role_category',
        //             value : stItemCategory
        //         });
        //
        //         var boolLineFound = false;
        //         var objLineDetails = {};
        //
        //         if (intLine != -1) {
        //             objLineDetails.limit = parseFloat(objConfigRecord.getSublistValue({
        //                 sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
        //                 fieldId : 'custrecord_mf_item_cat_role_greater_than',
        //                 line : intLine
        //             })) || 0;
        //
        //             objLineDetails.role = objConfigRecord.getSublistText({
        //                 sublistId : 'recmachcustrecord_mf_item_cat_role_parent',
        //                 fieldId : 'custrecord_mf_item_cat_role_approverrole',
        //                 line : intLine
        //             });
        //
        //             boolLineFound = true;
        //         }
        //
        //         var bRiskAssessment = false;
        //         for ( var i in constants.RISK_ASSESSMENT_FLD) {
        //             bRiskAssessment = objTran.getValue({
        //                 fieldId : constants.RISK_ASSESSMENT_FLD[i]
        //             });
        //             if (bRiskAssessment) {
        //                 break;
        //             }
        //         }
        //
        //         if (!boolLineFound || (boolLineFound && (flUsdAmount <= objLineDetails.limit && !bRiskAssessment))) {
        //             stApprovalRoute += 'Supervisor > ';
        //         } else {
        //             stApprovalRoute += objLineDetails.role + ' > Supervisor > ';
        //         }
        //     } else if (objTran.type == record.Type.VENDOR_BILL && !bPartnerTran) { // if bill and not partner transaction
        //         stApprovalRoute += 'Supervisor > ';
        //     }
        //
        //     // consider HR level to find start level in CoA
        //     var stEmpProcLvl = objTran.getValue('custbody_mf_emp_procurement_level');
        //
        //     var foundLevel = null;
        //     var bSkipMain = false;
        //
        //     // find the highest limit the requestor's HR level has permission for approval
        //     var firstLvlWithSufficientLimit;
        //     var lastLvlForEmpHr; // last level where requestor's HR level is set as Level Main or Addition Approver
        //     var lastLvlMainAppr; // last level where requestor's HR level is set as Level Main Approver only
        //
        //     for ( var k in constants.ARR_STARTLEVELS) {
        //         var flLvlLimit = parseFloat(objConfigRecord.getValue('custrecord_mf_upto_lvl' + constants.ARR_STARTLEVELS[k])) || -1;
        //         var stLvlApprovers = objConfigRecord.getValue('custrecord_mf_approvers_lvl' + constants.ARR_STARTLEVELS[k]);
        //         var arrLvlAddApprovers = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + constants.ARR_STARTLEVELS[k]) || [];
        //
        //         // flLvlLimit == -1 -> level limit not defined -> last level
        //         if ((flUsdAmount <= flLvlLimit || flLvlLimit == -1) && !firstLvlWithSufficientLimit) { // don't overwrite
        //             firstLvlWithSufficientLimit = constants.ARR_STARTLEVELS[k];
        //         }
        //
        //         if (stLvlApprovers == stEmpProcLvl) { // can be overwritten
        //             lastLvlForEmpHr = constants.ARR_STARTLEVELS[k];
        //             lastLvlMainAppr = constants.ARR_STARTLEVELS[k];
        //         }
        //
        //         if (arrLvlAddApprovers.indexOf(stEmpProcLvl) != -1) {
        //             lastLvlForEmpHr = constants.ARR_STARTLEVELS[k];
        //         }
        //     }
        //
        //     lastLvlForEmpHr = lastLvlForEmpHr ? lastLvlForEmpHr : constants.ARR_STARTLEVELS[0]; // start from beginning if HR level not defined as Main or Additional approver
        //
        //     if (lastLvlForEmpHr >= firstLvlWithSufficientLimit) {
        //         foundLevel = firstLvlWithSufficientLimit;
        //     } else {
        //         foundLevel = lastLvlForEmpHr;
        //     }
        //
        //     var arrChartApprovers = [];
        //     var arrChartAddApprovers = [];
        //
        //     var stMainApproverLevel = objConfigRecord.getValue('custrecord_mf_approvers_lvl' + foundLevel);
        //     var arrAdditionalConfigApprovers = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + foundLevel) || [];
        //
        //     if (stMainApproverLevel == stEmpProcLvl) {
        //         bSkipMain = true;
        //     }
        //
        //     var intConfigLine = objConfigRecord.findSublistLineWithValue({
        //         sublistId : 'recmachcustrecord_mf_hr_lvl_permmap_parent',
        //         fieldId : 'custrecord_mf_hr_lvl_permmap_main_apprvr',
        //         value : stMainApproverLevel
        //     });
        //     // Some roles can replace main approver, e.g. Director of Finance can replace L2
        //     if (intConfigLine != -1) {
        //         var stDirectorLevel = objConfigRecord.getSublistValue({
        //             sublistId : 'recmachcustrecord_mf_hr_lvl_permmap_parent',
        //             fieldId : 'custrecord_mf_hr_lvl_permmap_director',
        //             line : intConfigLine
        //         });
        //         if (arrAdditionalConfigApprovers.indexOf(stDirectorLevel) != -1) {
        //             bSkipMain = true;
        //         }
        //     }
        //
        //     // if Requestor's HR level is set as Main approver in the higher or same level as foundLevel then skip Main approver - Requestor has higher limit
        //     if (lastLvlMainAppr && constants.ARR_STARTLEVELS.indexOf(lastLvlMainAppr) >= constants.ARR_STARTLEVELS.indexOf(foundLevel)) {
        //         bSkipMain = true;
        //     }
        //
        //     if (!lastLvlMainAppr) {
        //         var stMainApproverLastLvl = objConfigRecord.getValue('custrecord_mf_approvers_lvl' + lastLvlForEmpHr);
        //         var arrAddApproverLastLvl = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + lastLvlForEmpHr) || [];
        //         var arrLastLvlApprovers = [ stMainApproverLastLvl ];
        //         arrAddApproverLastLvl.forEach(function(x) {
        //             arrLastLvlApprovers.push(x); // can't modify array from multiselect field
        //         });
        //
        //         // if Main Approver from found level is not included in approver (Main + Additional) from last level where the Requestor's HR level is included
        //         if (arrLastLvlApprovers.indexOf(stMainApproverLevel) == -1) {
        //             bSkipMain = true;
        //         }
        //     }
        //
        //     //log.debug('Skip Main: ' + bSkipMain, 'foundLevel: ' + foundLevel + ', Emp Lvl: ' + stEmpProcLvl);
        //
        //     for (var i = constants.ARR_STARTLEVELS.indexOf(foundLevel); i < constants.ARR_STARTLEVELS.length; i++) {
        //         var stLvlApprover = objConfigRecord.getText('custrecord_mf_approvers_lvl' + constants.ARR_STARTLEVELS[i]);
        //         if (arrChartApprovers.indexOf(stLvlApprover) == -1 && !bSkipMain) {
        //             arrChartApprovers.push(stLvlApprover);
        //         }
        //         bSkipMain = false; // only skip main approver in the start level
        //
        //         var arrLvlAddApproversTxt = objConfigRecord.getText('custrecord_mf_add_approvers_lvl' + constants.ARR_STARTLEVELS[i]); // multiselect, returns array of text values
        //         var arrLvlAddApproversId = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + constants.ARR_STARTLEVELS[i]); // can't use getText on stEmpProcLvl in CREATE
        //         if (!isEmpty(arrLvlAddApproversTxt)) {
        //             for (var p = 0; p < arrLvlAddApproversTxt.length; p++) {
        //                 if (arrChartAddApprovers.indexOf(arrLvlAddApproversTxt[p]) == -1 && arrLvlAddApproversId[p] != stEmpProcLvl) {
        //                     arrChartAddApprovers.push(arrLvlAddApproversTxt[p]);
        //                 }
        //             }
        //         }
        //
        //         var flLvlLimit = parseFloat(objConfigRecord.getValue('custrecord_mf_upto_lvl' + constants.ARR_STARTLEVELS[i])) || 0;
        //         if (flUsdAmount <= flLvlLimit) { // up to
        //             break;
        //         }
        //     }
        //
        //     for (var i = 0; i < arrChartAddApprovers.length; i++) {
        //         if (arrChartApprovers.indexOf(arrChartAddApprovers[i]) != -1) {
        //             // remove additional approvers which could have been also included in main approvers; e.g. L0
        //             arrChartAddApprovers.splice(i, 1);
        //         }
        //     }
        //
        //     stApprovalRoute += arrChartApprovers.join(' > ');
        //     if (!isEmpty(arrChartAddApprovers)) {
        //         if (!(/>$/.test(stApprovalRoute.trim()))) {
        //             // doesn't end with '>' -> approvers were added
        //             stApprovalRoute += ' > ';
        //         }
        //         stApprovalRoute += arrChartAddApprovers.join(' > ');
        //     }
        //
        //     if (/>$/.test(stApprovalRoute.trim())) {
        //         stApprovalRoute = stApprovalRoute.trim().slice(0, -1); // remove trailing >
        //     }
        //
        //     return stApprovalRoute;
        //
        // }

        function setInitialApprover(objNewRec, options) {

            log.debug('options',options.arn);
            if (options.arn == constants.PO_VB_ARN.awaiting_procurement_approval) {
                // PSR293 Universal Procurement Categories
                var intProcurmentApprovalRole = runtime.getCurrentScript().getParameter('custscript_mf_procurement_op_role');
                
                objNewRec.setValue({
                    fieldId : 'custbody_mf_approval_role',
                    value : intProcurmentApprovalRole
                });
            }
            if(options.arn == constants.PO_VB_ARN.awaiting_tactical_sourcing_approval){
                //tactical approval
                 var intTacticalSourcingRole = runtime.getCurrentScript().getParameter('custscript_tactical_sourcing_role');
                   objNewRec.setValue({
                    fieldId : 'custbody_mf_approval_role',
                    value : intTacticalSourcingRole
                });

            }

            if (options.arn == constants.PO_VB_ARN.awaiting_supervisor_approval) {

                if (options.requestor) {
                    var objRequestorLookUp = search.lookupFields({
                        type : search.Type.EMPLOYEE,
                        id : options.requestor,
                        columns : [ 'supervisor' ]
                    });
                    var stSupervisor = '';
                    if (!isEmpty(objRequestorLookUp) && objRequestorLookUp.supervisor[0]) {
                        stSupervisor = objRequestorLookUp.supervisor[0].value;

                        objNewRec.setValue({
                            fieldId : 'custbody_mf_next_approvers',
                            value : [ stSupervisor ]
                        });
                    }
                }
            }

            if (options.arn == constants.PO_VB_ARN.awaiting_intercompany_approval_1) {
                var objSubsidiary = search.lookupFields({
                    type : search.Type.SUBSIDIARY,
                    id : options.subsidiary,
                    columns : [ 'custrecord_mf_intercompany_approver1' ]
                });
                var stIcApprover = '';
                if (!isEmpty(objSubsidiary) && objSubsidiary.custrecord_mf_intercompany_approver1[0]) {
                    stIcApprover = objSubsidiary.custrecord_mf_intercompany_approver1[0].value;

                    objNewRec.setValue({
                        fieldId : 'custbody_mf_next_approvers',
                        value : [ stIcApprover ]
                    });
                } else {
                    var objError = error
                        .create({
                            name : 'MISSING_IC_APPROVER_1',
                            message : 'Selected Vendor is Intercompany Vendor. Please, contact Administrator to update missing Intercompany Approvers on the Subsidiary record',
                            notifyOff : true
                        });
                    throw objError;
                }
            }

        }

        function routeViaChartOfApprovals(objOldRecord, objNewRecord, objConfigRecord) {

            if (isEmpty(objOldRecord)) {
                objOldRecord = objNewRecord;
            }

            var stEmpProcLvl = objOldRecord.getValue('custbody_mf_emp_procurement_level');
            var flUsdAmount = parseFloat(objOldRecord.getValue('custbody_mf_usd_amount')) || 0;

            var foundLevel = null;
            var bSkipMain = false;

            // find the highest limit the requestor's HR level has permission for approval
            var firstLvlWithSufficientLimit;
            var lastLvlForEmpHr; // last level where requestor's HR level is set as Level Main or Addition Approver
            var lastLvlMainAppr; // last level where requestor's HR level is set as Level Main Approver only

            for ( var k in constants.ARR_STARTLEVELS) {
                var flLvlLimit = parseFloat(objConfigRecord.getValue('custrecord_mf_upto_lvl' + constants.ARR_STARTLEVELS[k])) || -1;
                var stLvlApprovers = objConfigRecord.getValue('custrecord_mf_approvers_lvl' + constants.ARR_STARTLEVELS[k]);
                var arrLvlAddApprovers = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + constants.ARR_STARTLEVELS[k]) || [];

                // flLvlLimit == -1 -> level limit not defined -> last level
                if ((flUsdAmount <= flLvlLimit || flLvlLimit == -1) && !firstLvlWithSufficientLimit) { // don't overwrite
                    firstLvlWithSufficientLimit = constants.ARR_STARTLEVELS[k];
                }

                if (stLvlApprovers == stEmpProcLvl) { // can be overwritten
                    lastLvlForEmpHr = constants.ARR_STARTLEVELS[k];
                    lastLvlMainAppr = constants.ARR_STARTLEVELS[k];
                }

                if (arrLvlAddApprovers.indexOf(stEmpProcLvl) != -1) {
                    lastLvlForEmpHr = constants.ARR_STARTLEVELS[k];
                }
            }

            lastLvlForEmpHr = lastLvlForEmpHr ? lastLvlForEmpHr : constants.ARR_STARTLEVELS[0];
            // start from beginning if HR level not defined as Main or Additional approver

            if (lastLvlForEmpHr >= firstLvlWithSufficientLimit) {
                foundLevel = firstLvlWithSufficientLimit;
            } else {
                foundLevel = lastLvlForEmpHr;
            }

            var arrNextApprovers;
            var stMainApproverLevel = objConfigRecord.getValue('custrecord_mf_approvers_lvl' + foundLevel);
            var arrAdditionalConfigApprovers = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + foundLevel) || [];

            if (stMainApproverLevel == stEmpProcLvl) {
                bSkipMain = true;
            }

            var intConfigLine = objConfigRecord.findSublistLineWithValue({
                sublistId : 'recmachcustrecord_mf_hr_lvl_permmap_parent',
                fieldId : 'custrecord_mf_hr_lvl_permmap_main_apprvr',
                value : stMainApproverLevel
            });
            // Some roles can replace main approver, e.g. Director of Finance can replace L2
            if (intConfigLine != -1) {
                var stDirectorLevel = objConfigRecord.getSublistValue({
                    sublistId : 'recmachcustrecord_mf_hr_lvl_permmap_parent',
                    fieldId : 'custrecord_mf_hr_lvl_permmap_director',
                    line : intConfigLine
                });
                if (arrAdditionalConfigApprovers.indexOf(stDirectorLevel) != -1) {
                    bSkipMain = true;
                }
            }

            // if Requestor's HR level is set as Main approver in the higher or same level as foundLevel then skip Main approver - Requestor has higher limit
            if (lastLvlMainAppr && constants.ARR_STARTLEVELS.indexOf(lastLvlMainAppr) >= constants.ARR_STARTLEVELS.indexOf(foundLevel)) {
                bSkipMain = true;
            }

            if (!lastLvlMainAppr) {
                var stMainApproverLastLvl = objConfigRecord.getValue('custrecord_mf_approvers_lvl' + lastLvlForEmpHr);
                var arrAddApproverLastLvl = objConfigRecord.getValue('custrecord_mf_add_approvers_lvl' + lastLvlForEmpHr) || [];
                var arrLastLvlApprovers = [ stMainApproverLastLvl ];
                arrAddApproverLastLvl.forEach(function(x) {
                    arrLastLvlApprovers.push(x); // can't modify array from multiselect field
                });

                // if Main Approver from found level is not included in approver (Main + Additional) from last level where the Requestor's HR level is included
                if (arrLastLvlApprovers.indexOf(stMainApproverLevel) == -1) {
                    bSkipMain = true;
                }
            }

            //log.debug('Skip Main: ' + bSkipMain, 'foundLevel: ' + foundLevel);

            if (!bSkipMain) {

                var intApprovalRoutingNoteId = objConfigRecord.getValue('custrecord_mf_routing_note_lvl' + foundLevel);

                objNewRecord.setValue({
                    fieldId : 'custbody_mf_approvalroutingnote',
                    value : intApprovalRoutingNoteId
                });

                objNewRecord.setValue({
                    fieldId : 'custbody_mf_current_app_level',
                    value : parseInt(foundLevel)
                });

                var bFromMatrix = objConfigRecord.getValue('custrecord_mf_from_app_matrix_lvl' + foundLevel);
                var stRequestor = objOldRecord.getValue('custbody_mf_tran_requestor');

                var arrAleadyApproved = objNewRecord.getValue('custbody_mf_approved_by').split(',');
                arrAleadyApproved.push(stRequestor); // requestor should be excluded
                if (bFromMatrix) {

                    var stMatrix = objOldRecord.getValue('custbody_mf_procur_approval_matrix');
                    var objMatrix = search.lookupFields({
                        type : 'customrecord_mf_approvalmatrixtemplate',
                        id : stMatrix,
                        columns : [ constants.HR_LVL_MATRIX_MAP[stMainApproverLevel] ]
                    });
                    var stNextApprover = '';
                    if (!isEmpty(objMatrix) && objMatrix[constants.HR_LVL_MATRIX_MAP[stMainApproverLevel]][0]) {
                        var stMatrixApprover = objMatrix[constants.HR_LVL_MATRIX_MAP[stMainApproverLevel]][0].value;
                        if (arrAleadyApproved.indexOf(stMatrixApprover) == -1) {
                            arrNextApprovers = [ stMatrixApprover ];
                        }
                    }
                } else {
                    arrNextApprovers = getEmployeesByHrLvl(stMainApproverLevel, arrAleadyApproved);
                }
            } else {
                arrNextApprovers = [];
            }

            var arrOldAddApprovers = objOldRecord.getValue({
                fieldId : 'custbody_mf_add_approvers' // text expected
            });

            var arrAddApprovers = isEmpty(arrOldAddApprovers) ? [] : arrOldAddApprovers.split(',');
            //log.debug('arrAddApprovers', arrAddApprovers);
            // don't include requestor's HR level
            for (var p = 0; p < arrAdditionalConfigApprovers.length; p++) {
                if (arrAddApprovers.indexOf(arrAdditionalConfigApprovers[p]) == -1 && arrAdditionalConfigApprovers[p] != stEmpProcLvl) {
                    arrAddApprovers.push(arrAdditionalConfigApprovers[p]);
                }
            }

            var stAddApprovers = arrAddApprovers.join();

            objNewRecord.setValue({
                fieldId : 'custbody_mf_add_approvers',
                value : stAddApprovers
            });

            if (isEmpty(arrNextApprovers)) {

                var stMatrix = objOldRecord.getValue({
                    fieldId : 'custbody_mf_procur_approval_matrix'
                });

                goToNextLevel(objNewRecord, flUsdAmount, foundLevel, objConfigRecord, stAddApprovers, stMatrix, stRequestor, stEmpProcLvl);
            } else {

                objNewRecord.setValue({
                    fieldId : 'custbody_mf_next_approvers',
                    value : arrNextApprovers
                });

            }

        }

        // set Next Approver based on the "Chart of Approval Configuration" custom record
        function goToNextLevel(newRec, usdAmt, currentLevel, config, addApprovers, matrix, requestor, stEmpProcLvl) {

            var flLvlLimit = (currentLevel != 'additional') ? (parseFloat(config.getValue('custrecord_mf_upto_lvl' + parseInt(currentLevel))) || 0)
                : 0;
            /*//log.debug('goToNextLevel', {
                usdAmt : usdAmt,
                currentLevel : currentLevel,
                addApprovers : addApprovers,
                flLvlLimit : flLvlLimit
            });*/
            var stAlereadyApproved = newRec.getValue('custbody_mf_approved_by');
            var arrAleadyApproved = (stAlereadyApproved ? stAlereadyApproved.split(',') : []);
            arrAleadyApproved.push(requestor); // Requestor should be excluded
            //log.debug('arrAleadyApproved', arrAleadyApproved);
            if (parseInt(currentLevel) == 7 || currentLevel == 'additional' || parseFloat(usdAmt) <= flLvlLimit) {
                if (!isEmpty(addApprovers)) {
                    var stFirstAddApprover = addApprovers.split(',')[0];
                    if (stFirstAddApprover) {

                        var objEmpLvl = search.lookupFields({
                            type : 'customrecord_mf_emp_procurement_level',
                            id : stFirstAddApprover,
                            columns : [ 'custrecord_mf_emp_proc_lvl_from_matrix' ]
                        });
                        var arrNextApprovers = [];
                        if (objEmpLvl.custrecord_mf_emp_proc_lvl_from_matrix) {
                            var objMatrix = search.lookupFields({
                                type : 'customrecord_mf_approvalmatrixtemplate',
                                id : matrix,
                                columns : [ constants.HR_LVL_MATRIX_MAP[stFirstAddApprover] ]
                            });
                            if (!isEmpty(objMatrix) && objMatrix[constants.HR_LVL_MATRIX_MAP[stFirstAddApprover]][0]) {
                                var stMatrixApprover = objMatrix[constants.HR_LVL_MATRIX_MAP[stFirstAddApprover]][0].value;
                                if (arrAleadyApproved.indexOf(stMatrixApprover) == -1) {
                                    arrNextApprovers = [ stMatrixApprover ];
                                }
                            }
                        } else {
                            arrNextApprovers = getEmployeesByHrLvl(stFirstAddApprover, arrAleadyApproved);
                        }

                        newRec.setValue('custbody_mf_next_approvers', arrNextApprovers);
                        var arrAddApprovers = addApprovers.split(',');
                        arrAddApprovers.shift(); // remove first
                        newRec.setValue('custbody_mf_add_approvers', arrAddApprovers.join());

                        newRec.setValue('custbody_mf_current_app_level', 'additional');

                        if (isEmpty(arrNextApprovers) && !isEmpty(arrAddApprovers)) {
                            goToNextLevel(newRec, usdAmt, 'additional', config, arrAddApprovers.join(), matrix, requestor, stEmpProcLvl);
                        } else if (isEmpty(arrNextApprovers) && isEmpty(arrAddApprovers)) {
                            newRec.setValue('custbody_mf_approvalroutingnote', constants.PO_VB_ARN.completed);
                            newRec.setValue('custbody_mf_next_approvers', []); // Defect 4446
                        } else {
                            var intConfigLine = config.findSublistLineWithValue({
                                sublistId : 'recmachcustrecord_mf_lvl_routing_note_parent',
                                fieldId : 'custrecord_mf_lvl_routing_note_hr_level',
                                value : stFirstAddApprover
                            });
                            if (intConfigLine != -1) {
                                var stNewArn = config.getSublistValue({
                                    sublistId : 'recmachcustrecord_mf_lvl_routing_note_parent',
                                    fieldId : 'custrecord_mf_lvl_routing_note_arn',
                                    line : intConfigLine
                                });
                                newRec.setValue('custbody_mf_approvalroutingnote', stNewArn);
                            }
                        }

                    }
                } else {
                    newRec.setValue('custbody_mf_approvalroutingnote', constants.PO_VB_ARN.completed);
                    newRec.setValue('custbody_mf_next_approvers', []); // Defect 4446
                }
            } else {
                var intNextLvl = parseInt(currentLevel) + 1;
                var stNextLvlHr = config.getValue('custrecord_mf_approvers_lvl' + intNextLvl);
                var bFromMatrix = config.getValue('custrecord_mf_from_app_matrix_lvl' + intNextLvl);
                var arrNextApprovers;
                if (bFromMatrix) {
                    var objMatrix = search.lookupFields({
                        type : 'customrecord_mf_approvalmatrixtemplate',
                        id : matrix,
                        columns : [ constants.HR_LVL_MATRIX_MAP[stNextLvlHr] ]
                    });
                    if (!isEmpty(objMatrix) && objMatrix[constants.HR_LVL_MATRIX_MAP[stNextLvlHr]][0]) {
                        var stMatrixApprover = objMatrix[constants.HR_LVL_MATRIX_MAP[stNextLvlHr]][0].value;
                        if (arrAleadyApproved.indexOf(stMatrixApprover) == -1) {
                            arrNextApprovers = [ stMatrixApprover ];
                        }
                    }
                } else {
                    arrNextApprovers = getEmployeesByHrLvl(stNextLvlHr, arrAleadyApproved);
                }

                var stNewAddApprovers = '';

                var arrConfigAddApprovers = config.getValue('custrecord_mf_add_approvers_lvl' + intNextLvl);
                if (!isEmpty(arrConfigAddApprovers)) {

                    if (!isEmpty(addApprovers)) {
                        var arrAddApprovers = addApprovers.split(',');
                        for (var p = 0; p < arrConfigAddApprovers.length; p++) {
                            if (arrAddApprovers.indexOf(arrConfigAddApprovers[p]) == -1 && arrConfigAddApprovers[p] != stEmpProcLvl) {
                                arrAddApprovers.push(arrConfigAddApprovers[p]);
                            }
                        }

                        stNewAddApprovers = arrAddApprovers.join();
                    } else {
                        stNewAddApprovers = arrConfigAddApprovers.join();
                    }

                    newRec.setValue('custbody_mf_add_approvers', stNewAddApprovers);
                }

                if (isEmpty(arrNextApprovers)) {
                    //log.debug('goToNextLevel', 'go deeper');
                    goToNextLevel(newRec, usdAmt, intNextLvl, config, stNewAddApprovers, matrix, requestor, stEmpProcLvl);
                } else {
                    newRec.setValue('custbody_mf_next_approvers', arrNextApprovers);
                    newRec.setValue('custbody_mf_current_app_level', intNextLvl);
                    newRec.setValue('custbody_mf_approvalroutingnote', config.getValue('custrecord_mf_routing_note_lvl' + intNextLvl));

                }
            }
        }

        function getEmployeesByHrLvl(level, alreadyApproved) {
            /*var objQueryEmp = query.create({
                type : query.Type.EMPLOYEE
            });
            var condition1 = objQueryEmp.createCondition({
                fieldId : 'custentity_mf_employeeprocurementlevel',
                operator : query.Operator.ANY_OF,
                values : [ level ]
            });
            var condition2 = objQueryEmp.createCondition({
                fieldId : 'isinactive',
                operator : query.Operator.IS,
                values : [ false ]
            });
            objQueryEmp.condition = objQueryEmp.and(condition1, condition2);
            if (!isEmpty(alreadyApproved)) {
                var condition3 = objQueryEmp.createCondition({
                    fieldId : 'id',
                    operator : query.Operator.ANY_OF_NOT,
                    values : alreadyApproved
                });
                objQueryEmp.condition = objQueryEmp.and(condition1, condition2, condition3);
            }
            objQueryEmp.columns = [ objQueryEmp.createColumn({
                fieldId : 'id'
            }) ];
            var arrEmpResults = [];
            var objPagedData = objQueryEmp.runPaged({
                pageSize : 1000
            });
            objPagedData.pageRanges.forEach(function(pageRange) {
                var objPage = objPagedData.fetch({
                    index : pageRange.index
                }).data;
                // map results to columns
                arrEmpResults.push.apply(arrEmpResults, objPage.results.map(function(result) {
                    return mf_lib.mapResultsToColumns(result, objPage)
                }));
            });*/

            var arrFilters = [ [ "custentity_mf_employeeprocurementlevel", "anyof", level ],
                "AND",
                [ "isinactive", "is", "F" ],
                "AND",
                [ "email", "isnotempty", "" ] ];
            if (!isEmpty(alreadyApproved)) {
                arrFilters.push("AND");
                arrFilters.push([ "internalid", "noneof", alreadyApproved ])
            }
            var employeeSearchObj = search.create({
                type : "employee",
                filters : arrFilters,
                columns : [ search.createColumn({
                    name : "internalid",
                    label : "Internal ID"
                }) ]
            });
            var arrEmpResults = [];
            var objPagedSearch = employeeSearchObj.runPaged({
                pageSize : 1000
            });
            for (var i = 0, j = objPagedSearch.pageRanges.length; i < j; i++) {
                var objSearchData = objPagedSearch.fetch({
                    index : objPagedSearch.pageRanges[i].index
                });
                arrEmpResults = arrEmpResults.concat(objSearchData.data);
            }

            var arrNextApprovers = [];
            for ( var i in arrEmpResults) {
                arrNextApprovers.push(arrEmpResults[i].id);
            }

            return arrNextApprovers;
        }

        var OBJ_PDF = null; // reuse when emailing twice upon approval
        var TRAN_NUM = '';
        function emailApproval(action, recTran, approver, data, roleBased, generatePdf, template) {
          log.debug('inside email');
            var stRequestor = recTran.getValue('custbody_mf_tran_requestor')
                || runtime.getCurrentScript().getParameter('custscript_mf_tran_approval_def_sender');
            // Default sender is set in General Preferences, it's parameter from NS | UE | JE Approval & Validation

            if (!stRequestor) {
                return;
            }

            var arrVendorEmails = [];
            if (action == 'vendor') {
                var stVendorEmail = search.lookupFields({
                    type : search.Type.VENDOR,
                    id : recTran.getValue('entity'),
                    columns : [ 'email' ]
                }).email;

                if (isEmpty(stVendorEmail)) {
                    return;
                }
            } else if (action == 'vendor_po' || action == 'vendor_po_mdf') { //send it to the email defined in the PO for MDF
                var objVendorEmails = search.lookupFields({
                    type : search.Type.VENDOR,
                    id : recTran.getValue('entity'),
                    columns : [ 'email', 'custentity_mf_invoice_emails' ]
                });

                if (objVendorEmails.email) {
                    arrVendorEmails.push(objVendorEmails.email);
                }
                if (objVendorEmails.custentity_mf_invoice_emails) {
                    var arrInvoiceEmails = [];
                    if (objVendorEmails.custentity_mf_invoice_emails.indexOf(',') != -1) {
                        arrInvoiceEmails = objVendorEmails.custentity_mf_invoice_emails.replace(/;/g, ',').split(','); // in case there's mix
                    } else if (objVendorEmails.custentity_mf_invoice_emails.indexOf(';') != -1) {
                        arrInvoiceEmails = objVendorEmails.custentity_mf_invoice_emails.split(';');
                    } else {
                        arrInvoiceEmails.push(objVendorEmails.custentity_mf_invoice_emails);
                    }

                    arrVendorEmails = arrVendorEmails.concat(arrInvoiceEmails);
                }

                var bToBeEmailed = recTran.getValue('tobeemailed');
                if (bToBeEmailed) {
                    var stPoEmails = recTran.getValue('email');
                    var arrPoEmail = [];
                    if (stPoEmails.indexOf(',') != -1) {
                        arrPoEmail = stPoEmails.replace(/;/g, ',').split(',');
                    } else if (stPoEmails.indexOf(';') != -1) {
                        arrPoEmail = stPoEmails.split(';');
                    } else {
                        arrPoEmail.push(stPoEmails);
                    }

                    arrVendorEmails = arrVendorEmails.concat(arrPoEmail);

                }



                if (action == 'vendor_po_mdf')
                {
                    var arrPoEmail = [];
                    var stPoEmails = recTran.getValue('email');
                    if (stPoEmails.indexOf(',') != -1) {
                        arrPoEmail = stPoEmails.replace(/;/g, ',').split(',');
                    } else if (stPoEmails.indexOf(';') != -1) {
                        arrPoEmail = stPoEmails.split(';');
                    } else {
                        arrPoEmail.push(stPoEmails);
                    }
                    arrVendorEmails = [];
                    arrVendorEmails = arrVendorEmails.concat(arrPoEmail);
                }


                if (isEmpty(arrVendorEmails)) {
                    return;
                } else {
                    arrVendorEmails = arrVendorEmails.filter(function(value, index, self) {
                        return self.indexOf(value) === index; // remove duplicates
                    });
                }
            }

            if (!TRAN_NUM) {
                if (recTran.type == record.Type.VENDOR_BILL) {
                    TRAN_NUM = recTran.getValue('transactionnumber');
                    if (TRAN_NUM == 'To Be Generated') {
                        TRAN_NUM = search.lookupFields({
                            type : search.Type.VENDOR_BILL,
                            id : recTran.id,
                            columns : [ 'transactionnumber' ]
                        }).transactionnumber;
                    }
                } else {
                    TRAN_NUM = recTran.getValue('tranid');
                    if (TRAN_NUM == 'To Be Generated') {
                        TRAN_NUM = search.lookupFields({
                            type : search.Type.PURCHASE_ORDER,
                            id : recTran.id,
                            columns : [ 'tranid' ]
                        }).tranid;
                    }
                }
            }

            //stTranNum = (stTranNum == 'To Be Generated') ? '' : stTranNum;

            if (!approver || parseInt(approver) == -1) {
                approver = stRequestor;
            }

            //log.debug('emailApproval', action);

            if (generatePdf && (action == 'vendor' || action == 'vendor_po' || action == 'vendor_po_mdf' || action != 'pending')) {
                if (isEmpty(OBJ_PDF)) {
                    try {
                        // vendor bill doesn't support printing natively
                        if (recTran.type == record.Type.VENDOR_BILL) {
                            var objTmplRenderer = render.create();
                            var objTmplFile = file.load(constants.VENDOR_BILL_PDF_TEMP);
                            objTmplRenderer.templateContent = objTmplFile.getContents();
                            objTmplRenderer.addRecord('record', record.load({
                                type : record.Type.VENDOR_BILL,
                                id : recTran.id
                            }));

                            OBJ_PDF = objTmplRenderer.renderAsPdf();
                            OBJ_PDF.name = 'VENDOR_BILL_' + TRAN_NUM + '.pdf';

                        } else {
                            OBJ_PDF = render.transaction({
                                entityId : recTran.id,
                                printMode : render.PrintMode.PDF
                            });
                        }
                    } catch (err) {
                        log.error('Error in attachment rendering: ' + recTran.type + ' : ' + recTran.id, JSON.stringify(err));
                    }
                }
            }

            if (action == 'vendor' || action == 'vendor_po'|| action == 'vendor_po_mdf') {
                if (template) {
                    var objMergeResult = render.mergeEmail({
                        templateId : template,
                        entity : null,
                        recipient : null,
                        supportCaseId : null,
                        transactionId : recTran.id,
                        customRecord : null
                    });

                    var objRelRec = {};
                    if (ATTACH_EMAIL) {
                        objRelRec.transactionId = recTran.id;
                        objRelRec.entityId = recTran.getValue('entity');
                    }

                    var arrRecipients = (action == 'vendor') ? [ recTran.getValue('entity') ] : arrVendorEmails;

                    var objOptions = {
                        author : stRequestor,
                        author : stRequestor,
                        recipients : arrRecipients,
                        subject : objMergeResult.subject,
                        body : objMergeResult.body,
                        relatedRecords : objRelRec
                    }
                    if (!isEmpty(OBJ_PDF)) {
                        objOptions.attachments = [ OBJ_PDF ];
                    }

                    try {
                        email.send(objOptions);
                    } catch (e) {
                        log.error('objOptions', objOptions);
                        throw e;
                    }
                    //log.debug('Email sent to Vendor', objMergeResult.body);
                } else {
                    log.error('Missing parameter', 'Vendor Bill Advise template');
                }
            } else if (action != 'pending') { // send email to requestor
                var stDomain = '';
                var strURL = url.resolveRecord({
                    recordType : recTran.type,
                    recordId : recTran.id,
                    isEditMode : false
                });

                var stBody = '';
                var stSubject = '';
                if (action == '3way') {
                    stSubject = 'Vendor Bill ' + TRAN_NUM + ' is pending 3-way match approval.';
                    stBody = stSubject + '<br><br>';
                    stBody += 'Related PO: ' + data.custbody_mf_rel_po_ref + '<br>';
                    stBody += 'Related PO Total: ' + data.custbody_mf_rel_po_total + '<br>';
                } else {
                    stSubject = (recTran.type == record.Type.VENDOR_BILL ? 'Vendor Bill ' : 'Purchase Order ') + TRAN_NUM + ' has been ' + action;
                    stBody = stSubject;
                    if (action == 'rejected') {
                        stBody += '<br><br>Rejection reason: ' + data;
                    }
                }
                stBody += '<br><br><a href=' + stDomain + strURL + '>View Record<a><br>';

                var objRelRec = {};
                if (ATTACH_EMAIL) {
                    objRelRec.transactionId = recTran.id;
                }

                ////log.debug('Sending email', stSubject);

                // Adding Employee as a recipient of an email
                var stEmployeeId = recTran.getValue('employee');

                var objOptions = {
                    author : approver,
                    recipients : [stRequestor, stEmployeeId],
                    subject : stSubject,
                    body : stBody,
                    relatedRecords : objRelRec
                }
                if (!isEmpty(OBJ_PDF)) {
                    objOptions.attachments = [ OBJ_PDF ];
                }

                try {
                    email.send(objOptions);
                } catch (e) {
                    log.error('objOptions', objOptions);
                    throw e;
                }
                //log.debug('Email sent', stBody);
            } else { // action == pending
                // construct email with approve/reject link
                var stNextApprover = recTran.getValue('custbody_mf_next_approvers');
                if (!roleBased && (isEmpty(stNextApprover) || stNextApprover == -1)) {
                    throw 'MISSING_NEXT_APPROVER';
                }
                var stArn = recTran.getValue('custbody_mf_approvalroutingnote');
                var bRejectOnly = (stArn == constants.PO_VB_ARN.awaiting_3way_matching_rejection);
                try {
                    mf_lib.sendApprovalEmail(recTran, false, true, true, roleBased, bRejectOnly); //html = false, pdf = true, delegate = true, roleBased = argument value
                } catch (e) {
                    if (e.name == 'UNEXPECTED_ERROR') {
                        throw 'MISSING_EMP_EMAIL';
                        //throw 'One or more approvers don\'t have an Email address set on their Employee record. The Email cannot be sent';
                    } else {
                        throw e;
                    }
                }

                //log.debug('Email sent to approvers', 'pending');
            }
        }

        function customLog(e, title) {
            if (typeof e === 'object') {
                if (e instanceof Error) {
                    log.error({
                        title : title + "| JavaScript ERROR",
                        details : "Name: " + e.name + ", Message: " + e.message + ", Stack: " + e.stack + ", File Name: " + (e.fileName || "N/A")
                            + ", Line Number: " + (e.lineNumber || "N/A")
                    });
                } else {
                    log.error({
                        title : title + "| SuiteScript ERROR",
                        details : "Name: " + e.name + ", Message: " + e.message + ", Stack: " + e.stack + ", ID: " + (e.id || "N/A")
                            + ", Cause: " + (JSON.stringify(e.cause) || "N/A")
                    });
                }
            } else {
                log.error('Error', e);
            }
            //throw e;
        }

        return {
            beforeLoad : beforeLoad_approvalRouting,
            beforeSubmit : beforeSubmit_approvalRouting,
            afterSubmit : afterSubmit_approvalRouting
        };
    });
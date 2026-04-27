import { Modal } from 'antd';
import React from 'react';
import { PRIVACY_POLICY_FULL_TEXT } from '../constants/privacyPolicyZh';
import { NOTEBOOK_PRODUCT_NAME } from '../constants/userAgreementZh';
import '../auth.less';

export type PrivacyPolicyModalProps = {
  open: boolean;
  onClose: () => void;
};

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      title={`${NOTEBOOK_PRODUCT_NAME}隐私政策`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
      className="nb-legal-modal"
    >
      <div className="nb-user-agreement-body">{PRIVACY_POLICY_FULL_TEXT}</div>
    </Modal>
  );
};

export default PrivacyPolicyModal;

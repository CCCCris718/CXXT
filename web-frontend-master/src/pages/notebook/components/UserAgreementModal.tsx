import { Modal } from 'antd';
import React from 'react';
import { NOTEBOOK_PRODUCT_NAME, USER_AGREEMENT_FULL_TEXT } from '../constants/userAgreementZh';
import '../auth.less';

export type UserAgreementModalProps = {
  open: boolean;
  onClose: () => void;
};

const UserAgreementModal: React.FC<UserAgreementModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      title={`${NOTEBOOK_PRODUCT_NAME}用户协议`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
      className="nb-legal-modal"
    >
      <div className="nb-user-agreement-body">{USER_AGREEMENT_FULL_TEXT}</div>
    </Modal>
  );
};

export default UserAgreementModal;

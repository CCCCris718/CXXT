package redlib.backend.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import redlib.backend.Constants;
import redlib.backend.mapper.NotebookUserMapper;
import redlib.backend.model.NotebookUser;
import redlib.backend.model.Token;
import redlib.backend.service.NotebookAuthService;
import redlib.backend.service.TokenService;
import redlib.backend.utils.FormatUtils;
import redlib.backend.utils.NotebookIdUtils;
import redlib.backend.utils.NotebookSecurityUtils;

import java.util.Date;
import java.util.HashSet;

@Service
public class NotebookAuthServiceImpl implements NotebookAuthService {
    private static final long NOTEBOOK_ID_CHANGE_COOLDOWN_MS = 30L * 24 * 60 * 60 * 1000;
    @Autowired
    private NotebookUserMapper notebookUserMapper;

    @Autowired
    private TokenService tokenService;

    @Override
    public Token login(String username, String password, String ipAddress, String userAgent) {
        Assert.hasText(username, "Username cannot be empty");
        Assert.hasText(password, "Password cannot be empty");
        String id = FormatUtils.trimToNull(username);
        Assert.hasText(id, "Username cannot be empty");
        NotebookUser user = notebookUserMapper.selectOne(new QueryWrapper<NotebookUser>()
                .eq("username", id)
                .eq("password", FormatUtils.password(password))
                .last("limit 1"));
        Assert.notNull(user, "Invalid username or password");
        Assert.isTrue(Boolean.TRUE.equals(user.getEnabled()), "This account has been disabled");
        Token token = new Token();
        token.setAccountType(Constants.ACCOUNT_TYPE_NOTEBOOK_USER);
        token.setUserId(user.getId());
        token.setUserCode(user.getUsername());
        token.setUserName(user.getUsername());
        token.setNotebookIdLastChangedAt(user.getUsernameLastChangedAt());
        token.setPrivSet(new HashSet<>());
        return tokenService.issueToken(token, ipAddress, userAgent);
    }

    @Override
    public Integer register(String username, String password, String confirmPassword, Boolean agreeToTerms) {
        String normalizedUsername = normalizeNotebookId(username);
        Assert.hasText(password, "密码不能为空");
        Assert.isTrue(password.length() >= 6, "密码长度不能少于 6 位");
        Assert.isTrue(password.equals(confirmPassword), "两次输入的密码不一致");
        Assert.isTrue(Boolean.TRUE.equals(agreeToTerms), "须同意用户协议与隐私政策");

        Long userCount = notebookUserMapper.selectCount(new QueryWrapper<NotebookUser>()
                .eq("username", normalizedUsername));
        Assert.isTrue(userCount == null || userCount == 0, "用户名已被占用");

        NotebookUser user = new NotebookUser();
        user.setUsername(normalizedUsername);
        user.setPassword(FormatUtils.password(password));
        user.setEnabled(Boolean.TRUE);
        user.setUsernameLastChangedAt(null);
        Date now = new Date();
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        notebookUserMapper.insert(user);
        return user.getId();
    }

    @Override
    public Token currentUser() {
        Token t = NotebookSecurityUtils.currentNotebookToken();
        NotebookUser u = notebookUserMapper.selectById(t.getUserId());
        if (u != null) {
            t.setUserCode(u.getUsername());
            t.setUserName(u.getUsername());
            t.setNotebookIdLastChangedAt(u.getUsernameLastChangedAt());
        }
        return t;
    }

    @Override
    public Token changeNotebookId(String newNotebookId, String password) {
        Assert.hasText(password, "Password cannot be empty");
        String newId = normalizeNotebookId(newNotebookId);
        Token t = NotebookSecurityUtils.currentNotebookToken();
        Assert.isTrue(!newId.equals(t.getUserCode()), "新用户名与当前相同");
        Long dup = notebookUserMapper.selectCount(new QueryWrapper<NotebookUser>().eq("username", newId));
        Assert.isTrue(dup == null || dup == 0, "该用户名已被占用");
        NotebookUser user = notebookUserMapper.selectById(t.getUserId());
        Assert.notNull(user, "user not found");
        Assert.isTrue(FormatUtils.password(password).equals(user.getPassword()), "密码错误");
        Date last = user.getUsernameLastChangedAt();
        if (last != null) {
            long notBefore = last.getTime() + NOTEBOOK_ID_CHANGE_COOLDOWN_MS;
            if (System.currentTimeMillis() < notBefore) {
                throw new IllegalStateException("用户名每 30 天仅能修改一次");
            }
        }
        String old = user.getUsername();
        user.setUsername(newId);
        user.setUpdatedAt(new Date());
        Date changedAt = new Date();
        user.setUsernameLastChangedAt(changedAt);
        notebookUserMapper.updateById(user);
        t.setUserCode(newId);
        t.setUserName(newId);
        t.setNotebookIdLastChangedAt(changedAt);
        return t;
    }

    @Override
    public void verifyCurrentPassword(String password) {
        Assert.hasText(password, "密码不能为空");
        Token t = NotebookSecurityUtils.currentNotebookToken();
        NotebookUser user = notebookUserMapper.selectById(t.getUserId());
        Assert.notNull(user, "user not found");
        Assert.isTrue(FormatUtils.password(password).equals(user.getPassword()), "密码错误");
    }

    @Override
    public void changePassword(String oldPassword, String newPassword, String confirmNewPassword) {
        Assert.hasText(oldPassword, "请填写原密码");
        Assert.hasText(newPassword, "请填写新密码");
        Assert.hasText(confirmNewPassword, "请再次输入新密码");
        Assert.isTrue(newPassword.length() >= 6, "新密码长度不能少于 6 位");
        Assert.isTrue(newPassword.equals(confirmNewPassword), "两次输入的新密码不一致");
        Assert.isTrue(!newPassword.equals(oldPassword), "新密码不能与当前密码相同");
        Token t = NotebookSecurityUtils.currentNotebookToken();
        NotebookUser user = notebookUserMapper.selectById(t.getUserId());
        Assert.notNull(user, "user not found");
        Assert.isTrue(FormatUtils.password(oldPassword).equals(user.getPassword()), "原密码错误");
        user.setPassword(FormatUtils.password(newPassword));
        user.setUpdatedAt(new Date());
        notebookUserMapper.updateById(user);
    }

    private String normalizeNotebookId(String username) {
        String normalized = FormatUtils.trimToNull(username);
        Assert.hasText(normalized, "用户名不能为空");
        Assert.isTrue(NotebookIdUtils.isValid(normalized), "用户名格式不符合要求：6–20 位，以字母开头，仅含字母、数字、下划线和减号");
        return normalized;
    }

}

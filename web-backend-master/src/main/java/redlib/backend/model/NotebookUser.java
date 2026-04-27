package redlib.backend.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.util.Date;

@Data
@TableName("notebook_user")
public class NotebookUser {
    @TableId(type = IdType.AUTO)
    private Integer id;

    private String username;

    private String password;
    private Boolean enabled;

    @TableField("created_at")
    private Date createdAt;

    @TableField("updated_at")
    private Date updatedAt;

    /**
     * 上次修改「登录用 Notebook ID」（即 username 列）的时间；为 null 表示注册后尚未改过，允许首次修改。
     */
    @TableField("username_last_changed_at")
    private Date usernameLastChangedAt;
}
